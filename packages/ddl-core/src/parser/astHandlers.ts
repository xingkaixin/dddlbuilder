import { createEntityId } from '@ddlbuilder/shared-types';
import type {
  IndexField,
  IndexKind,
  NormalizedField,
  ForeignKeyDefinition,
  ForeignKeyAction,
} from '@ddlbuilder/shared-types';
import {
  getCanonicalBaseType,
  supportsDefaultCurrentTimestamp,
  supportsUuidDefault,
} from '../utils/databaseTypeMapping.js';
import { buildPrimaryKeyName } from '../utils/primaryKeyNaming.js';
import type { ParsedResult } from './types.js';
import {
  readField,
  stringifyAstValue,
  type AlterTableStmt,
  type ColumnDefNode,
  type ColumnListNode,
  type CreateIndexStmt,
  type CreateTableStmt,
  type ForeignKeyNode,
  type OnActionNode,
} from './astTypes.js';
import {
  buildIndexFields,
  buildTypeString,
  extractFunctionName,
  normalizeColumnName,
  normalizeLiteral,
} from './normalizers.js';
import { unquoteSqlIdentifier } from '../utils/sqlIdentifiers.js';
import type { DatabaseFamily } from '../utils/databaseFamily.js';
import { SqlParseError } from './SqlParseError.js';

// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof
const MYSQL_ENGINE_NAME_MAP = new Map([
  ['innodb', 'InnoDB'],
  ['myisam', 'MyISAM'],
  ['memory', 'MEMORY'],
  ['archive', 'ARCHIVE'],
  ['csv', 'CSV'],
]);

type ForeignKeyActions = {
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
};

const FOREIGN_KEY_ACTIONS = [
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
  'RESTRICT',
  'NO ACTION',
] as const;

const UNSUPPORTED_COLUMN_ATTRIBUTES = [
  ['generated', 'GENERATED 生成列'],
  ['check', 'CHECK 约束'],
  ['character_set', '列级 CHARACTER SET'],
  ['collate', '列级 COLLATE'],
] as const;

export const assertRepresentableIndexType = (indexType: string | null | undefined) => {
  const unsupported = indexType?.match(/^(fulltext|spatial)\b/i)?.[1];

  if (unsupported) throw SqlParseError.unsupported(`${unsupported.toUpperCase()} 索引`);
};

const generatedIdentifierPart = (name: string) =>
  unquoteSqlIdentifier(name).replace(/[^\p{L}\p{N}_$]+/gu, '_');

function buildDefaultIndexName(
  result: ParsedResult,
  fields: IndexField[],
  kind: IndexKind,
): string {
  if (kind === 'primary') {
    return buildPrimaryKeyName(generatedIdentifierPart(result.tableName));
  }

  const prefix = kind === 'index' ? 'idx' : 'uk';

  return `${prefix}_${fields.map((field) => generatedIdentifierPart(field.name)).join('_')}`;
}

function pushIndex(
  result: ParsedResult,
  name: string | null | undefined,
  fields: IndexField[],
  kind: IndexKind,
) {
  if (fields.length === 0) return;
  result.indexes.push({
    id: createEntityId(),
    name: name?.trim() ? name : buildDefaultIndexName(result, fields, kind),
    fields,
    kind,
  });
}

function parseOnAction(actionList: OnActionNode[]): ForeignKeyActions {
  const result: ForeignKeyActions = {};

  if (!Array.isArray(actionList)) return result;

  for (const action of actionList) {
    if (!action.type || !action.value) continue;
    const actionType = action.type.toLowerCase();
    const nestedValue = readField(action.value, 'value');
    const rawValue = typeof nestedValue === 'string' ? nestedValue : action.value;
    const actionValue = typeof rawValue === 'string' ? rawValue.toUpperCase() : '';

    const normalizedAction = FOREIGN_KEY_ACTIONS.find((candidate) => candidate === actionValue);

    if (!normalizedAction) continue;

    if (actionType === 'on delete') {
      result.onDelete = normalizedAction;
    } else if (actionType === 'on update') {
      result.onUpdate = normalizedAction;
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

  const constraintName =
    def.constraint ||
    `fk_${generatedIdentifierPart(result.tableName)}_${fieldNames.map(generatedIdentifierPart).join('_')}`;
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
  pushIndex(result, name, fields, 'primary');
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

  const nestedValue = readField(value, 'value');

  if (typeof nestedValue === 'string') {
    return normalizeLiteral(nestedValue);
  }

  return '';
}

function normalizeEngineName(engine: string): string {
  const normalized = engine.trim();

  if (!normalized) return '';

  return MYSQL_ENGINE_NAME_MAP.get(normalized.toLowerCase()) ?? normalized;
}

function mapColumnToField(
  colDef: ColumnDefNode,
  serializeExpression: (value: unknown) => string,
  databaseFamily?: DatabaseFamily,
): NormalizedField {
  for (const [attribute, feature] of UNSUPPORTED_COLUMN_ATTRIBUTES) {
    if (colDef[attribute]) throw SqlParseError.unsupported(feature);
  }

  const name = normalizeColumnName(colDef.column);
  const typeStr = buildTypeString(colDef.definition, serializeExpression, databaseFamily);

  let comment = '';

  if (colDef.comment) {
    comment = normalizeLiteral(colDef.comment.value.value);
  }

  let nullable = true;

  if (colDef.nullable) {
    if (colDef.nullable.value === 'not null') {
      nullable = false;
    } else if (colDef.nullable.value === 'null') {
      nullable = true;
    }
  }

  if (colDef.primary_key || colDef.generated_by_default) {
    nullable = false;
  }

  let defaultKind: NormalizedField['defaultKind'] = 'none';
  let defaultValue = '';

  if (colDef.default_val) {
    const val = colDef.default_val.value;
    const funcName = extractFunctionName(val);
    const literalType = readField(val, 'type');

    if (literalType === 'single_quote_string' || literalType === 'double_quote_string') {
      defaultKind = 'constant';
      const value = stringifyAstValue(readField(val, 'value'));
      defaultValue =
        literalType === 'single_quote_string'
          ? value.replace(/''/g, "'")
          : value.replace(/""/g, '"');
    } else if (literalType === 'number' || literalType === 'bool' || (!literalType && !funcName)) {
      const numericText = readField(val, 'value');

      // node-sql-parser builds decimal literals with parseFloat().toFixed(), so values beyond
      // 15 significant digits may already differ from the SQL text.
      if (
        literalType === 'number' &&
        typeof numericText === 'string' &&
        numericText.replace(/\D/g, '').replace(/^0+/, '').length > 15
      )
        throw SqlParseError.unsupported('超过 15 位有效数字的数值默认值（可改用带引号的写法）');
      defaultKind = 'constant';
      defaultValue = normalizeLiteral(val);
    } else if (funcName && ['now', 'current_timestamp', 'sysdate'].includes(funcName)) {
      defaultKind = 'current_timestamp';
    } else {
      const expression = serializeExpression(val);
      const call = expression.replace(/^\((.*)\)$/s, '$1').toLowerCase();

      if (
        databaseFamily === 'sqlserver' &&
        call === 'getdate()' &&
        supportsDefaultCurrentTimestamp('sqlserver', typeStr)
      ) {
        defaultKind = 'current_timestamp';
      } else if (
        supportsUuidDefault(getCanonicalBaseType(typeStr)) &&
        ((databaseFamily === 'mysql' && call === 'uuid()') ||
          ((databaseFamily === 'oracle' || databaseFamily === 'dm') && call === 'sys_guid()') ||
          (databaseFamily === 'postgresql' && call === 'gen_random_uuid()') ||
          (databaseFamily === 'sqlserver' && call === 'newid()'))
      ) {
        defaultKind = 'uuid';
      } else {
        defaultKind = 'expression';
        defaultValue = expression;
      }
    }
  }

  if (colDef.auto_increment || colDef.generated_by_default) {
    defaultKind = 'auto_increment';
    defaultValue = '';
  }

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
  databaseFamily?: DatabaseFamily,
) {
  if (stmt.table && stmt.table.length > 0) {
    const schema = stmt.table[0].db || stmt.table[0].schema || '';

    if (typeof schema === 'string' && schema.length) {
      result.schemaName = schema;
    }

    result.tableName = stmt.table[0].table;
  }

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

  if (stmt.create_definitions) {
    stmt.create_definitions.forEach((def) => {
      if (def.resource === 'column') {
        const field = mapColumnToField(def, serializeExpression, databaseFamily);
        result.fields.push(field);

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
            def.constraint?.constraint,
            [{ name: field.name, direction: 'ASC' }],
            'unique_constraint',
          );
        }
      } else if (def.resource === 'constraint') {
        if (def.constraint_type === 'primary key') {
          pushPrimaryKey(result, buildIndexFields(def.definition), def.constraint || def.index);
        } else if (['unique', 'unique key', 'unique index'].includes(def.constraint_type ?? '')) {
          const fields = buildIndexFields(def.definition || []);
          pushIndex(result, def.constraint || def.index, fields, 'unique_constraint');
        } else if (def.constraint_type?.toLowerCase() === 'foreign key') {
          pushForeignKey(result, def);
        } else if (def.constraint_type?.toLowerCase() === 'check') {
          throw SqlParseError.unsupported('CHECK 约束');
        }
      } else if (def.resource === 'index') {
        assertRepresentableIndexType(def.keyword);
        const fields = buildIndexFields(def.definition || []);
        pushIndex(
          result,
          def.index,
          fields,
          def.index_type === 'unique' || def.keyword === 'unique' ? 'unique_index' : 'index',
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

  const effectiveTableName = targetTableName ?? result.tableName;

  if (effectiveTableName && tableName !== effectiveTableName) {
    return;
  }

  const columns = stmt.index_columns || stmt.columns;

  if (!columns || !Array.isArray(columns)) {
    return;
  }

  const fields: IndexField[] = buildIndexFields(columns);

  assertRepresentableIndexType(stmt.index_type);
  pushIndex(
    result,
    indexName,
    fields,
    stmt.index_type === 'unique' || stmt.keyword === 'unique' ? 'unique_index' : 'index',
  );
}

export function parseAlterTable(
  stmt: AlterTableStmt,
  result: ParsedResult,
  targetTableName?: string,
) {
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
      case 'unique index':
        pushIndex(result, name, fields, 'unique_constraint');
        break;
      case 'foreign key':
        pushForeignKey(result, definition);
        break;
    }
  });
}
// oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof
