import { v4 as uuidv4 } from 'uuid';
import type {
  DatabaseType,
  IndexField,
  NormalizedField,
  ForeignKeyDefinition,
  ForeignKeyAction,
} from '@ddlbuilder/shared-types';
import { buildPrimaryKeyName } from '@ddlbuilder/ddl-core';
import type { ParsedResult } from './types.js';
import {
  buildIndexFields,
  buildTypeString,
  extractFunctionName,
  normalizeColumnName,
  normalizeLiteral,
} from './normalizers.js';

const MYSQL_ENGINE_NAME_MAP: Record<string, string> = {
  innodb: 'InnoDB',
  myisam: 'MyISAM',
  memory: 'MEMORY',
  archive: 'ARCHIVE',
  csv: 'CSV',
};

function pushIndex(
  result: ParsedResult,
  name: string,
  fields: IndexField[],
  unique: boolean,
  isPrimary = false,
) {
  if (fields.length === 0) return;
  const baseName = result.tableName || name;
  const normalizedName = isPrimary ? buildPrimaryKeyName(baseName) : name;
  result.indexes.push({
    id: uuidv4(),
    name: normalizedName,
    fields,
    unique,
    isPrimary,
  });
}

function parseOnAction(actionList: any[]): {
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
} {
  const result: { onDelete?: ForeignKeyAction; onUpdate?: ForeignKeyAction } = {};
  if (!Array.isArray(actionList)) return result;

  for (const action of actionList) {
    if (!action.type || !action.value) continue;
    const actionType = action.type.toLowerCase();
    const actionValue = action.value.value?.toUpperCase() || action.value.toUpperCase?.() || '';

    if (actionType === 'on delete') {
      result.onDelete = actionValue as ForeignKeyAction;
    } else if (actionType === 'on update') {
      result.onUpdate = actionValue as ForeignKeyAction;
    }
  }

  return result;
}

function pushForeignKey(result: ParsedResult, def: any) {
  if (!def.definition || !Array.isArray(def.definition) || def.definition.length === 0) return;
  if (!def.reference_definition) return;

  const fieldNames: string[] = [];
  for (const col of def.definition) {
    const colName = col.column || (typeof col === 'string' ? col : null);
    if (colName) fieldNames.push(colName);
  }
  if (fieldNames.length === 0) return;

  const refDef = def.reference_definition;
  const refTableInfo = refDef.table?.[0];
  if (!refTableInfo) return;

  const refFieldNames: string[] = [];
  for (const col of refDef.definition || []) {
    const colName = col.column || (typeof col === 'string' ? col : null);
    if (colName) refFieldNames.push(colName);
  }
  if (refFieldNames.length === 0) return;

  const constraintName = def.constraint || `fk_${result.tableName}_${fieldNames.join('_')}`;
  const onActions = parseOnAction(refDef.on_action || []);

  const fk: ForeignKeyDefinition = {
    id: uuidv4(),
    name: constraintName,
    fields: fieldNames,
    refSchema: refTableInfo.db || undefined,
    refTable: refTableInfo.table,
    refFields: refFieldNames,
    ...onActions,
  };

  result.foreignKeys.push(fk);
}

function enforceNotNullForFields(result: ParsedResult, fieldNames: string[]) {
  if (!fieldNames.length) return;
  result.fields = result.fields.map((f) =>
    fieldNames.includes(f.name) ? { ...f, nullable: false } : f,
  );
}

function normalizeTableOptionValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    return normalizeLiteral(value);
  }
  if (
    typeof value === 'object' &&
    value &&
    'value' in value &&
    typeof (value as Record<string, unknown>).value === 'string'
  ) {
    return normalizeLiteral((value as Record<string, string>).value);
  }
  return '';
}

function normalizeEngineName(engine: string): string {
  const normalized = engine.trim();
  if (!normalized) return '';
  return MYSQL_ENGINE_NAME_MAP[normalized.toLowerCase()] ?? normalized;
}

function mapColumnToField(colDef: any, _dbType: DatabaseType): NormalizedField {
  const name = normalizeColumnName(colDef.column);
  const typeStr = buildTypeString(colDef.definition);

  // Comment
  let comment = '';
  if (colDef.comment) {
    comment = normalizeLiteral(colDef.comment.value.value);
  }

  // Nullable
  let nullable = true;
  if (colDef.nullable) {
    if (colDef.nullable.value === 'not null') {
      nullable = false;
    } else if (colDef.nullable.value === 'null') {
      nullable = true;
    }
  }
  if (colDef.primary_key) {
    nullable = false;
  }

  // Default
  let defaultKind: NormalizedField['defaultKind'] = 'none';
  let defaultValue = '';

  if (colDef.default_val) {
    const val = colDef.default_val.value;
    const funcName = extractFunctionName(val);

    if (funcName) {
      if (['now', 'current_timestamp', 'sysdate'].includes(funcName)) {
        defaultKind = 'current_timestamp';
      } else if (funcName === 'uuid') {
        defaultKind = 'uuid';
      } else {
        defaultKind = 'constant';
        defaultValue = `${funcName}()`;
      }
    } else {
      defaultKind = 'constant';
      defaultValue = normalizeLiteral(val);
    }
  }

  // Auto Increment
  if (colDef.auto_increment) {
    defaultKind = 'auto_increment';
    defaultValue = '';
  }

  // On Update
  let onUpdate: NormalizedField['onUpdate'] = 'none';
  const onUpdateSource =
    colDef.on_update?.value ||
    colDef.on_update ||
    (colDef.default_val?.value && typeof colDef.default_val.value === 'object'
      ? colDef.default_val.value.over
      : undefined);
  const onUpdateFuncName = extractFunctionName(onUpdateSource);
  if (onUpdateFuncName && ['now', 'current_timestamp', 'sysdate'].includes(onUpdateFuncName)) {
    onUpdate = 'current_timestamp';
  }

  return {
    name,
    type: typeStr,
    comment,
    nullable,
    defaultKind,
    defaultValue,
    onUpdate,
  };
}

export function parseCreateTable(stmt: any, result: ParsedResult, dbType: DatabaseType) {
  // 1. Table Name
  if (stmt.table && stmt.table.length > 0) {
    const schema = stmt.table[0].db || stmt.table[0].schema || '';
    if (typeof schema === 'string' && schema.trim()) {
      result.schemaName = schema.trim();
    }
    result.tableName = stmt.table[0].table;
  }

  // 2. Table Comment
  if (stmt.table_options) {
    const tableMiscConfig = {
      enabled: false,
      engine: '',
      charset: '',
      collation: '',
      tablespace: '',
    };

    stmt.table_options.forEach((option: any) => {
      const keyword = String(option.keyword || '')
        .toLowerCase()
        .trim();
      const optionValue = normalizeTableOptionValue(option.value);
      if (!optionValue) return;

      if (keyword === 'comment' && !result.tableComment) {
        result.tableComment = optionValue;
        return;
      }

      if (keyword === 'engine') {
        tableMiscConfig.engine = normalizeEngineName(optionValue);
        return;
      }

      if (keyword === 'default charset' || keyword === 'charset') {
        tableMiscConfig.charset = optionValue;
        return;
      }

      if (keyword === 'collate' || keyword === 'collation') {
        tableMiscConfig.collation = optionValue;
        return;
      }

      if (keyword === 'tablespace') {
        tableMiscConfig.tablespace = optionValue;
      }
    });

    if (
      tableMiscConfig.engine ||
      tableMiscConfig.charset ||
      tableMiscConfig.collation ||
      tableMiscConfig.tablespace
    ) {
      result.tableMiscConfig = {
        ...tableMiscConfig,
        enabled: true,
      };
    }
  }

  // 3. Columns & Inline Indexes
  if (stmt.create_definitions) {
    stmt.create_definitions.forEach((def: any) => {
      if (def.resource === 'column') {
        const field = mapColumnToField(def, dbType);
        result.fields.push(field);

        // Handle inline primary key / unique
        if (def.primary_key) {
          pushIndex(result, 'PRIMARY', [{ name: field.name, direction: 'ASC' }], true, true);
          enforceNotNullForFields(result, [field.name]);
        }

        if (def.unique) {
          pushIndex(
            result,
            `uk_${field.name}`,
            [{ name: field.name, direction: 'ASC' }],
            true,
            false,
          );
        }
      } else if (def.resource === 'constraint') {
        if (def.constraint_type === 'primary key') {
          const fields = buildIndexFields(def.definition || []);
          pushIndex(result, 'PRIMARY', fields, true, true);
          enforceNotNullForFields(
            result,
            fields.map((f) => f.name),
          );
        } else if (def.constraint_type === 'unique key' || def.constraint_type === 'unique') {
          const fields = buildIndexFields(def.definition || []);
          const indexName =
            def.constraint || def.index || `uk_${fields.map((f: any) => f.name).join('_')}`;
          pushIndex(result, indexName, fields, true, false);
        } else if (def.constraint_type?.toLowerCase() === 'foreign key') {
          pushForeignKey(result, def);
        }
      } else if (def.resource === 'index') {
        const fields = buildIndexFields(def.definition || []);
        pushIndex(
          result,
          def.index,
          fields,
          def.index_type === 'unique' || def.keyword === 'unique',
          false,
        );
      }
    });
  }
}

export function parseCreateIndex(stmt: any, result: ParsedResult, targetTableName?: string) {
  const indexName = stmt.index;
  const tableName = stmt.table.table;

  // Only process if table name matches (simple validation)
  const effectiveTableName = targetTableName ?? result.tableName;
  if (effectiveTableName && tableName !== effectiveTableName) {
    return;
  }

  const columns = stmt.index_columns || stmt.columns;
  if (!columns || !Array.isArray(columns)) {
    return;
  }

  const fields: IndexField[] = buildIndexFields(columns);

  pushIndex(
    result,
    indexName,
    fields,
    stmt.index_type === 'unique' || stmt.keyword === 'unique',
    false,
  );
}

export function parseAlterTable(stmt: any, result: ParsedResult, targetTableName?: string) {
  // Basic support for ALTER TABLE ADD PRIMARY KEY / INDEX / FOREIGN KEY
  if (!stmt.expr || !Array.isArray(stmt.expr)) return;

  const alterTargetTable = stmt.table?.table;
  if (targetTableName && alterTargetTable && alterTargetTable !== targetTableName) {
    return;
  }

  stmt.expr.forEach((expr: any) => {
    const defs = expr.create_definitions;
    if (expr.action === 'add' && defs) {
      const constraintType = defs.constraint_type?.toLowerCase?.() || '';
      if (constraintType === 'primary key') {
        const fields = buildIndexFields(defs.definition || []);
        pushIndex(result, 'PRIMARY', fields, true, true);
        enforceNotNullForFields(
          result,
          fields.map((f) => f.name),
        );
      } else if (constraintType === 'foreign key') {
        pushForeignKey(result, defs);
      }
    } else if (
      expr.action === 'add' &&
      expr.resource === 'constraint' &&
      expr.constraint_type?.toLowerCase?.() === 'primary key'
    ) {
      // Fallback for other AST structure
      const fields = buildIndexFields(expr.definition || []);
      pushIndex(result, 'PRIMARY', fields, true, true);
      enforceNotNullForFields(
        result,
        fields.map((f) => f.name),
      );
    } else if (
      expr.action === 'add' &&
      expr.resource === 'constraint' &&
      expr.constraint_type?.toLowerCase?.() === 'foreign key'
    ) {
      pushForeignKey(result, expr);
    }
  });
}

export function parseDCL(stmt: any, result: ParsedResult) {
  // Handle GRANT statements
  // Example: GRANT SELECT ON table TO user
  const users = stmt.user_or_roles || stmt.to;
  if (users && Array.isArray(users)) {
    users.forEach((user: any) => {
      const userName = user.name ? user.name.value : user.user || String(user);
      if (userName && !result.authObjects.includes(userName)) {
        result.authObjects.push(userName);
      }
    });
  }
}

export function parseTransactGrant(stmt: any, result: ParsedResult) {
  if (!Array.isArray(stmt)) return;
  const toPart = stmt.find((s: any) => s?.stmt?.left?.name === 'TO');
  const nameNode = toPart?.stmt?.right?.name?.[0];
  const value = nameNode?.value ?? nameNode;
  const userName = value ? String(value) : '';
  if (userName && !result.authObjects.includes(userName)) {
    result.authObjects.push(userName);
  }
}
