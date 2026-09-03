import { splitQualifiedName } from '@ddlbuilder/shared-types';
export { splitQualifiedName, getSchemaAndTable } from '@ddlbuilder/shared-types';
import type { DatabaseType, ParsedFieldType } from '@ddlbuilder/shared-types';
import { TypeMapper } from './TypeMapper.js';
import { escapeSqlString, getDatabaseFamily } from './databaseFamily.js';
import { canonicalizeBaseType } from './typeAliases.js';
import { formatSqlIdentifier } from './sqlIdentifiers';

export const getFieldTypeForDatabase = (databaseType: DatabaseType, fieldType: string): string => {
  const parsed = parseFieldType(fieldType);
  const typeMapper = TypeMapper.create(databaseType);
  return typeMapper.mapType(parsed);
};

const CONSTRAINT_STARTERS = new Set([
  'default',
  'not',
  'null',
  'generated',
  'unique',
  'primary',
  'comment',
  'on',
  'check',
  'references',
  'constraint',
  'collate',
]);

// ENUM/SET 字面量中的逗号、括号和约束关键字属于参数内容。
const QUOTED_TYPE_ARGUMENT = String.raw`'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"`;
const TYPE_TOKENS = new RegExp(`(?:${QUOTED_TYPE_ARGUMENT}|\\S)+`, 'g');
const TYPE_WITH_ARGS = new RegExp(
  `^([a-z0-9_\\s]+?)(?:\\(((?:${QUOTED_TYPE_ARGUMENT}|[^'"\\)])*)\\))?(\\s+(?:with|without)\\s+time\\s+zone)?$`,
  'i',
);
const TYPE_ARGUMENTS = new RegExp(`(?:${QUOTED_TYPE_ARGUMENT}|[^,])+`, 'g');

const stripTrailingConstraints = (type: string): string => {
  const tokens = type.match(TYPE_TOKENS) ?? [];
  if (tokens.length === 0) return '';

  let end = tokens.length;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i].toLowerCase();
    if (CONSTRAINT_STARTERS.has(token)) {
      end = i;
      break;
    }
  }

  return tokens.slice(0, end).join(' ');
};

// 辅助函数：处理UNSIGNED后缀
const parseUnsigned = (type: string): { clean: string; isUnsigned: boolean } => {
  const isUnsigned = type.toLowerCase().endsWith('unsigned');
  const clean = isUnsigned ? type.replace(/\s+unsigned$/gi, '').trim() : type;
  return { clean, isUnsigned };
};

// 辅助函数：提取类型名称和参数
const extractTypeAndArgs = (type: string): { baseType: string; args: string[] } | null => {
  const match = type.match(TYPE_WITH_ARGS);
  if (!match) return null;

  const [, baseType, argString, suffix = ''] = match;
  const cleanBaseType = (baseType + suffix).trim().toLowerCase().replace(/\s+/g, ' ');
  const args = argString?.match(TYPE_ARGUMENTS)?.map((arg) => arg.trim()) ?? [];

  return { baseType: cleanBaseType, args };
};

// 辅助函数：处理特殊情况
const handleSpecialCases = (type: string): ParsedFieldType => {
  // 处理空字符串
  if (type === '') {
    return {
      baseType: '',
      args: [],
      unsigned: false,
      raw: '',
    };
  }

  // 处理 "()"
  if (type === '()') {
    return {
      baseType: '',
      args: [],
      unsigned: false,
      raw: '()',
    };
  }

  // 处理缺少开括号的情况，如 "varchar255)"
  const cleanBaseType = type.replace(/\)$/, '').toLowerCase();
  return {
    baseType: cleanBaseType,
    args: [],
    unsigned: false,
    raw: type,
  };
};

// 辅助函数：标准化参数数组
const normalizeArgs = (args: string[]): string[] => {
  return args.map((arg) => (arg.toLowerCase().trim() === 'max' ? 'max' : arg.trim()));
};

// 辅助函数：创建空字段类型
const createEmptyField = (): ParsedFieldType => ({
  baseType: '',
  args: [],
  unsigned: false,
  raw: '',
});

export const parseFieldType = (rawType: string): ParsedFieldType => {
  const clean = rawType.trim();

  // 处理空字符串
  if (clean === '') {
    return createEmptyField();
  }

  const withoutConstraints = stripTrailingConstraints(clean);

  // 处理UNSIGNED后缀
  const { clean: withoutUnsigned, isUnsigned } = parseUnsigned(withoutConstraints);

  // 尝试提取类型名称和参数
  const extracted = extractTypeAndArgs(withoutUnsigned);

  if (!extracted) {
    // 处理特殊情况（如 "()" 或 "varchar255)"）
    const specialCase = handleSpecialCases(withoutConstraints);
    return { ...specialCase, unsigned: isUnsigned, raw: clean };
  }

  // 正常情况：标准化参数并返回结果
  return {
    baseType: extracted.baseType,
    args: normalizeArgs(extracted.args),
    unsigned: isUnsigned,
    raw: clean,
  };
};

export const getCanonicalBaseType = (fieldType: string): string => {
  const parsed = parseFieldType(fieldType);
  return canonicalizeBaseType(parsed.baseType);
};

// 保留原有的支持函数以保持向后兼容
const isIntegerType = (canonical: string) =>
  new Set(['tinyint', 'smallint', 'int', 'integer', 'bigint']).has(canonical);

const isNumericType = (canonical: string) =>
  new Set([
    'tinyint',
    'smallint',
    'int',
    'integer',
    'bigint',
    'decimal',
    'number',
    'numeric',
    'real',
    'double',
    'float',
  ]).has(canonical);

const isCharacterType = (canonical: string) =>
  new Set([
    'char',
    'varchar',
    'text',
    'nchar',
    'nvarchar',
    'longtext',
    'mediumtext',
    'tinytext',
    'clob',
    'varchar2',
    'nvarchar2',
    'uuid',
  ]).has(canonical);

export const supportsUuidDefault = (canonical: string) => isCharacterType(canonical);

export const supportsAutoIncrement = (db: DatabaseType, canonical: string) => {
  switch (getDatabaseFamily(db)) {
    case 'mysql':
      return isIntegerType(canonical);
    case 'postgresql':
      return new Set(['smallint', 'int', 'integer', 'bigint']).has(canonical);
    case 'sqlserver':
      return new Set(['tinyint', 'smallint', 'int', 'bigint']).has(canonical);
    case 'oracle':
    case 'dm':
      return isNumericType(canonical);
    default:
      return false;
  }
};

export const supportsDefaultCurrentTimestamp = (db: DatabaseType, fieldType: string) => {
  const canonical = getCanonicalBaseType(getFieldTypeForDatabase(db, fieldType));
  switch (getDatabaseFamily(db)) {
    case 'mysql':
      return new Set(['timestamp', 'datetime']).has(canonical);
    case 'postgresql':
      return new Set(['timestamp', 'timestamptz']).has(canonical);
    case 'sqlserver':
      return new Set(['datetime', 'datetime2', 'datetimeoffset', 'timestamp']).has(canonical);
    case 'oracle':
    case 'dm':
      return new Set(['timestamp', 'timestamptz', 'date']).has(canonical);
    default:
      return false;
  }
};

export const supportsOnUpdateCurrentTimestamp = (db: DatabaseType, fieldType: string) => {
  const canonical = getCanonicalBaseType(getFieldTypeForDatabase(db, fieldType));
  switch (getDatabaseFamily(db)) {
    // MySQL 5.6.5+、MariaDB 10.1.2+、TiDB、OceanBase MySQL 模式支持 DATETIME 的 ON UPDATE CURRENT_TIMESTAMP
    case 'mysql':
      return new Set(['timestamp', 'datetime']).has(canonical);
    default:
      return false;
  }
};

export const formatConstantDefault = (
  canonical: string,
  value: string,
  dbType: DatabaseType = 'postgresql',
) => {
  const expression = formatConstantDefaultExpression(canonical, value, dbType);
  return expression ? ` DEFAULT ${expression}` : '';
};

export const formatConstantDefaultExpression = (
  canonical: string,
  value: string,
  dbType: DatabaseType = 'postgresql',
) => {
  const shouldQuote = shouldQuoteDefault(canonical, value);
  if (!shouldQuote && !value.trim()) return '';
  const cleanValue = escapeSqlString(value, dbType);
  return shouldQuote ? `'${cleanValue}'` : cleanValue;
};

export const shouldQuoteDefault = (canonical: string, value: string) => {
  if (isCharacterType(canonical)) return true;
  if (
    ['date', 'time', 'timestamp', 'datetime', 'datetime2', 'timetz', 'timestamptz'].includes(
      canonical,
    )
  )
    return true;
  if (['uuid', 'xml', 'json', 'jsonb'].includes(canonical)) return true;
  if (['boolean', 'bit'].includes(canonical)) return false;
  if (value.toLowerCase() === 'null') return false;
  if (isNumericType(canonical)) return false;
  return true;
};

export const escapeSingleQuotes = (value: string) => value.replace(/'/g, "''");

export const formatSqlTableName = (tableName: string, dbType: DatabaseType): string =>
  splitQualifiedName(tableName)
    .map((name) => formatSqlIdentifier(name, dbType))
    .join('.');

export const buildQualifiedTableName = (
  schemaName: string,
  tableName: string,
  dbType?: DatabaseType,
) => {
  const table = tableName.trim();
  if (!table) return '';

  const schema = schemaName.trim();
  const parts = schema ? [schema, table] : [table];
  return parts.map((name) => (dbType ? formatSqlIdentifier(name, dbType) : name)).join('.');
};
