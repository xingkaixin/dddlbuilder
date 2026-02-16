import { v4 as uuidv4 } from 'uuid';
import type { DatabaseType, IndexField, NormalizedField } from '../types';
import { buildPrimaryKeyName } from '../primaryKeyNaming';
import type { ParsedResult } from './types';
import {
  buildIndexFields,
  buildTypeString,
  extractFunctionName,
  normalizeColumnName,
  normalizeLiteral,
} from './normalizers';

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

function enforceNotNullForFields(result: ParsedResult, fieldNames: string[]) {
  if (!fieldNames.length) return;
  result.fields = result.fields.map((f) =>
    fieldNames.includes(f.name) ? { ...f, nullable: false } : f,
  );
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
  if (
    onUpdateFuncName &&
    ['now', 'current_timestamp', 'sysdate'].includes(onUpdateFuncName)
  ) {
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
  stmt: any,
  result: ParsedResult,
  dbType: DatabaseType,
) {
  // 1. Table Name
  if (stmt.table && stmt.table.length > 0) {
    result.tableName = stmt.table[0].table;
  }

  // 2. Table Comment
  if (stmt.table_options) {
    const commentOpt = stmt.table_options.find(
      (o: any) => o.keyword === 'comment',
    );
    if (commentOpt) {
      result.tableComment = commentOpt.value.replace(/^'|'$/g, '');
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
          pushIndex(
            result,
            'PRIMARY',
            [{ name: field.name, direction: 'ASC' }],
            true,
            true,
          );
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
        } else if (
          def.constraint_type === 'unique key' ||
          def.constraint_type === 'unique'
        ) {
          const fields = buildIndexFields(def.definition || []);
          const indexName =
            def.constraint ||
            def.index ||
            `uk_${fields.map((f: any) => f.name).join('_')}`;
          pushIndex(result, indexName, fields, true, false);
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

export function parseCreateIndex(stmt: any, result: ParsedResult) {
  const indexName = stmt.index;
  const tableName = stmt.table.table;

  // Only process if table name matches (simple validation)
  if (result.tableName && tableName !== result.tableName) {
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

export function parseAlterTable(stmt: any, result: ParsedResult) {
  // Basic support for ALTER TABLE ADD PRIMARY KEY / INDEX
  if (!stmt.expr || !Array.isArray(stmt.expr)) return;

  stmt.expr.forEach((expr: any) => {
    const defs = expr.create_definitions;
    if (expr.action === 'add' && defs) {
      if (defs.constraint_type === 'primary key') {
        const fields = buildIndexFields(defs.definition || []);
        pushIndex(result, 'PRIMARY', fields, true, true);
        enforceNotNullForFields(
          result,
          fields.map((f) => f.name),
        );
      }
    } else if (
      expr.action === 'add' &&
      expr.resource === 'constraint' &&
      expr.constraint_type === 'primary key'
    ) {
      // Fallback for other AST structure
      const fields = buildIndexFields(expr.definition || []);
      pushIndex(result, 'PRIMARY', fields, true, true);
      enforceNotNullForFields(
        result,
        fields.map((f) => f.name),
      );
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
