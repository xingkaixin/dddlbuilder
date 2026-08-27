import { createEntityId } from '@ddlbuilder/shared-types';
import type {
  IndexField,
  NormalizedField,
  ForeignKeyDefinition,
  ForeignKeyAction,
} from '@ddlbuilder/shared-types';
import { buildPrimaryKeyName } from '../utils/primaryKeyNaming.js';
import type { ParsedResult } from './types.js';
import {
  isTransactAssignList,
  readField,
  stringifyAstValue,
  type AlterTableStmt,
  type ColumnDefNode,
  type ColumnListNode,
  type CreateIndexStmt,
  type CreateTableStmt,
  type ForeignKeyNode,
  type GrantStmt,
  type OnActionNode,
} from './astTypes.js';
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
  kind: 'index' | 'primary' | 'unique' = 'index',
) {
  if (fields.length === 0) return;
  result.indexes.push({
    id: createEntityId(),
    name,
    fields,
    unique,
    isPrimary: kind === 'primary',
    ...(kind === 'unique' ? { isUniqueConstraint: true } : {}),
  });
}

function parseOnAction(actionList: OnActionNode[]): {
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
} {
  const result: { onDelete?: ForeignKeyAction; onUpdate?: ForeignKeyAction } = {};
  if (!Array.isArray(actionList)) return result;

  for (const action of actionList) {
    if (!action.type || !action.value) continue;
    const actionType = action.type.toLowerCase();
    const nestedValue = readField(action.value, 'value');
    const rawValue = typeof nestedValue === 'string' ? nestedValue : action.value;
    const actionValue = typeof rawValue === 'string' ? rawValue.toUpperCase() : '';

    if (actionType === 'on delete') {
      result.onDelete = actionValue as ForeignKeyAction;
    } else if (actionType === 'on update') {
      result.onUpdate = actionValue as ForeignKeyAction;
    }
  }

  return result;
}

function collectColumnNames(columns: Array<ColumnListNode | string> | undefined): string[] {
  return (columns ?? []).map(normalizeColumnName).filter(Boolean);
}

function pushForeignKey(result: ParsedResult, def: ForeignKeyNode) {
  const fieldNames = collectColumnNames(def.definition);
  if (fieldNames.length === 0) return;
  if (!def.reference_definition) return;

  const refDef = def.reference_definition;
  const refTableInfo = refDef.table?.[0];
  if (!refTableInfo) return;

  const refFieldNames = collectColumnNames(refDef.definition);
  if (refFieldNames.length === 0) return;

  const constraintName = def.constraint || `fk_${result.tableName}_${fieldNames.join('_')}`;
  const onActions = parseOnAction(refDef.on_action || []);

  const fk: ForeignKeyDefinition = {
    id: createEntityId(),
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

function pushPrimaryKey(result: ParsedResult, fields: IndexField[], name?: string | null) {
  pushIndex(result, name || buildPrimaryKeyName(result.tableName), fields, true, 'primary');
  enforceNotNullForFields(
    result,
    fields.map((field) => field.name),
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

function mapColumnToField(
  colDef: ColumnDefNode,
  serializeExpression: (value: unknown) => string,
): NormalizedField {
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
    const literalType = readField(val, 'type');
    if (literalType === 'single_quote_string' || literalType === 'double_quote_string') {
      defaultKind = 'constant';
      const value = stringifyAstValue(readField(val, 'value') ?? '');
      defaultValue =
        literalType === 'single_quote_string'
          ? value.replace(/''/g, "'")
          : value.replace(/""/g, '"');
    } else if (literalType === 'number' || literalType === 'bool' || (!literalType && !funcName)) {
      defaultKind = 'constant';
      defaultValue = normalizeLiteral(val);
    } else if (funcName && ['now', 'current_timestamp', 'sysdate'].includes(funcName)) {
      defaultKind = 'current_timestamp';
    } else if (funcName === 'uuid') {
      defaultKind = 'uuid';
    } else {
      defaultKind = 'expression';
      defaultValue = serializeExpression(val);
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
    colDef.on_update?.value || colDef.on_update || readField(colDef.default_val?.value, 'over');
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

export function parseCreateTable(
  stmt: CreateTableStmt,
  result: ParsedResult,
  serializeExpression: (value: unknown) => string,
) {
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

    stmt.table_options.forEach((option) => {
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
    stmt.create_definitions.forEach((def) => {
      if (def.resource === 'column') {
        const field = mapColumnToField(def, serializeExpression);
        result.fields.push(field);

        // Handle inline primary key / unique
        if (def.primary_key) {
          pushPrimaryKey(
            result,
            [{ name: field.name, direction: 'ASC' }],
            def.constraint?.constraint,
          );
        }

        if (def.unique) {
          pushIndex(
            result,
            def.constraint?.constraint || `uk_${field.name}`,
            [{ name: field.name, direction: 'ASC' }],
            true,
            'unique',
          );
        }
      } else if (def.resource === 'constraint') {
        if (def.constraint_type === 'primary key') {
          pushPrimaryKey(result, buildIndexFields(def.definition), def.constraint || def.index);
        } else if (def.constraint_type === 'unique key' || def.constraint_type === 'unique') {
          const fields = buildIndexFields(def.definition || []);
          const indexName =
            def.constraint || def.index || `uk_${fields.map((f) => f.name).join('_')}`;
          pushIndex(result, indexName, fields, true, 'unique');
        } else if (def.constraint_type?.toLowerCase() === 'foreign key') {
          pushForeignKey(result, def);
        }
      } else if (def.resource === 'index') {
        const fields = buildIndexFields(def.definition || []);
        pushIndex(
          result,
          // 匿名 KEY 的 index 为 null，沿用既有行为直接透传
          def.index as string,
          fields,
          def.index_type === 'unique' || def.keyword === 'unique',
        );
      }
    });
  }
}

export function parseCreateIndex(
  stmt: CreateIndexStmt,
  result: ParsedResult,
  targetTableName?: string,
) {
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

  pushIndex(result, indexName, fields, stmt.index_type === 'unique' || stmt.keyword === 'unique');
}

export function parseAlterTable(
  stmt: AlterTableStmt,
  result: ParsedResult,
  targetTableName?: string,
) {
  // Basic support for ALTER TABLE ADD PRIMARY KEY / INDEX / FOREIGN KEY
  if (!stmt.expr || !Array.isArray(stmt.expr)) return;

  const alterTargetTable = Array.isArray(stmt.table) ? undefined : stmt.table?.table;
  if (targetTableName && alterTargetTable && alterTargetTable !== targetTableName) {
    return;
  }

  stmt.expr.forEach((expr) => {
    if (expr.action !== 'add') return;
    const definition = expr.create_definitions ?? (expr.resource === 'constraint' ? expr : null);
    if (!definition) return;
    const name = definition.constraint || expr.create_definitions?.index;
    const fields = buildIndexFields(definition.definition);
    switch (definition.constraint_type?.toLowerCase()) {
      case 'primary key':
        pushPrimaryKey(result, fields, name);
        break;
      case 'unique':
      case 'unique key':
        pushIndex(
          result,
          name || `uk_${fields.map((field) => field.name).join('_')}`,
          fields,
          true,
          'unique',
        );
        break;
      case 'foreign key':
        pushForeignKey(result, definition);
        break;
    }
  });
}

export function parseDCL(stmt: GrantStmt, result: ParsedResult) {
  // Handle GRANT statements
  // Example: GRANT SELECT ON table TO user
  const users = stmt.user_or_roles || stmt.to;
  if (users && Array.isArray(users)) {
    users.forEach((user) => {
      const userName = user.name ? user.name.value : user.user || stringifyAstValue(user);
      if (userName && !result.authObjects.includes(userName)) {
        result.authObjects.push(userName);
      }
    });
  }
}

export function parseTransactGrant(stmt: unknown, result: ParsedResult) {
  if (!isTransactAssignList(stmt)) return;
  const toPart = stmt.find((s) => s?.stmt?.left?.name === 'TO');
  const nameNode = toPart?.stmt?.right?.name?.[0];
  const value = nameNode?.value ?? nameNode;
  const userName = value ? stringifyAstValue(value) : '';
  if (userName && !result.authObjects.includes(userName)) {
    result.authObjects.push(userName);
  }
}
