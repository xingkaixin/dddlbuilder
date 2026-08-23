import type { DatabaseType, ParsedFieldType } from '@ddlbuilder/shared-types';
import { TypeMapper } from './TypeMapper.js';
import { getDatabaseFamily } from './databaseFamily.js';
import { canonicalizeBaseType } from './typeAliases.js';

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

const stripTrailingConstraints = (type: string): string => {
  const tokens = type.trim().split(/\s+/);
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
  const match = type.match(/^([a-z0-9_\s]+)(?:\(([^)]*)\))?$/i);
  if (!match) return null;

  const [, baseType, argString] = match;
  const cleanBaseType = baseType.trim().toLowerCase();
  const args = argString ? argString.split(',').map((arg) => arg.trim()) : [];

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

export const supportsDefaultCurrentTimestamp = (db: DatabaseType, canonical: string) => {
  switch (getDatabaseFamily(db)) {
    case 'mysql':
      return new Set(['timestamp', 'datetime']).has(canonical);
    case 'postgresql':
      return new Set(['timestamp', 'timestamptz']).has(canonical);
    case 'sqlserver':
      return new Set(['datetime', 'datetime2', 'datetimeoffset', 'timestamp']).has(canonical);
    case 'oracle':
    case 'dm':
      return new Set(['timestamp', 'date']).has(canonical);
    default:
      return false;
  }
};

export const supportsOnUpdateCurrentTimestamp = (db: DatabaseType, canonical: string) => {
  switch (getDatabaseFamily(db)) {
    // MySQL 5.6.5+、MariaDB 10.1.2+、TiDB、OceanBase MySQL 模式支持 DATETIME 的 ON UPDATE CURRENT_TIMESTAMP
    case 'mysql':
      return new Set(['timestamp', 'datetime']).has(canonical);
    default:
      return false;
  }
};

/**
 * 获取 Oracle/OceanBase Oracle 模式的时间戳默认值表达式
 * - DATE 类型使用 SYSDATE（精确到秒）
 * - TIMESTAMP 类型使用 SYSTIMESTAMP（包含小数秒和时区）
 */
export const getOracleTimestampDefault = (canonical: string): string => {
  return canonical === 'date' ? 'SYSDATE' : 'SYSTIMESTAMP';
};

export const formatConstantDefault = (canonical: string, value: string) => {
  if (!value.trim()) return '';

  // 如果是函数或关键字，不加引号
  if (isLikelyFunctionOrKeyword(value)) {
    return ` DEFAULT ${value}`;
  }

  // 否则根据类型决定是否加引号
  const shouldQuote = shouldQuoteDefault(canonical, value);
  const cleanValue = escapeSingleQuotes(value);
  const formattedValue = shouldQuote ? `'${cleanValue}'` : cleanValue;
  return ` DEFAULT ${formattedValue}`;
};

export const shouldQuoteDefault = (canonical: string, value?: string) => {
  // 支持两种调用方式：shouldQuoteDefault(type) 或 shouldQuoteDefault(type, value)
  const testValue = value !== undefined ? value : 'test';

  if (!testValue?.trim()) return false;
  if (isCharacterType(canonical)) return true;
  if (
    ['date', 'time', 'timestamp', 'datetime', 'datetime2', 'timetz', 'timestamptz'].includes(
      canonical,
    )
  )
    return true;
  if (['uuid', 'xml', 'json'].includes(canonical)) return true;
  if (['jsonb'].includes(canonical)) return false;
  if (['boolean', 'bit'].includes(canonical)) return false;
  if (testValue.toLowerCase() === 'null') return false;
  if (isLikelyFunctionOrKeyword(testValue)) return false;
  if (isNumericType(canonical)) return false;
  return true;
};

export const isLikelyFunctionOrKeyword = (value: string) => {
  if (!value) return false;

  const exactKeywords = [
    'current_timestamp',
    'now()',
    'sysdate',
    'getdate()',
    'systimestamp',
    'uuid()',
    'newid()',
    'sys_guid',
    'default_value',
  ];

  const upperValue = value.toUpperCase().trim();

  // Check for exact matches first
  if (exactKeywords.some((keyword) => upperValue === keyword.toUpperCase())) {
    return true;
  }

  // Check for partial matches (but exclude specific cases)
  const partialKeywords = ['current_timestamp', 'uuid'];
  return partialKeywords.some((keyword) => {
    const upperKeyword = keyword.toUpperCase();
    return (
      upperValue.includes(upperKeyword) &&
      !upperValue.includes('NEXTVAL') && // Exclude this specific case
      !(upperValue.includes('GEN_RANDOM_UUID') && !upperValue.includes('('))
    ); // Exclude gen_random_uuid without parentheses
  });
};

export const escapeSingleQuotes = (value: string) => value.replace(/'/g, "''");

export const splitQualifiedName = (raw: string) =>
  raw
    .split('.')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

export const getSchemaAndTable = (raw: string) => {
  const parts = splitQualifiedName(raw);
  if (parts.length <= 1) {
    const table = parts[0] ?? raw.trim();
    return { schema: '', table };
  }
  return {
    schema: parts.slice(0, -1).join('.'),
    table: parts[parts.length - 1],
  };
};

export const buildQualifiedTableName = (schemaName: string, tableName: string) => {
  const table = tableName.trim();
  if (!table) return '';

  const schema = schemaName.trim();
  return schema ? `${schema}.${table}` : table;
};
