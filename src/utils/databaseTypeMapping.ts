import type { DatabaseType, ParsedFieldType } from "../types";
import { TypeMapper } from "./TypeMapper";

export const TYPE_ALIASES: Record<string, string> = {
  bigint: "bigint",
  bit: "bit",
  bool: "boolean",
  boolean: "boolean",
  char: "char",
  "character varying": "varchar",
  "character varrying": "varchar",
  clob: "text",
  date: "date",
  datetime: "datetime",
  datetime2: "datetime2",
  "datetime offset": "datetimeoffset",
  decimal: "decimal",
  double: "double",
  "double precision": "double",
  float: "float",
  float8: "double",
  int: "int",
  integer: "int",
  int4: "int",
  mediumtext: "mediumtext",
  nchar: "nchar",
  "national char": "nchar",
  "national character": "nchar",
  "national character varying": "nvarchar",
  "national varchar": "nvarchar",
  "nchar varying": "nvarchar",
  numeric: "decimal",
  number: "decimal",
  nvarchar: "nvarchar",
  real: "real",
  serial: "serial",
  smallint: "smallint",
  text: "text",
  timetz: "timetz",
  "time with time zone": "timetz",
  "time without time zone": "time",
  time: "time",
  timestamp: "timestamp",
  "timestamp without time zone": "timestamp",
  timestamptz: "timestamptz",
  tinyint: "tinyint",
  uuid: "uuid",
  varbinary: "varbinary",
  varchar: "varchar",
  xml: "xml",
  json: "json",
  jsonb: "jsonb",
  blob: "blob",
  longtext: "longtext",
  varchar2: "varchar",
  nvarchar2: "nvarchar",
};

export const canonicalizeBaseType = (baseType: string) =>
  TYPE_ALIASES[baseType] ?? baseType;

export const getFieldTypeForDatabase = (
  databaseType: DatabaseType,
  fieldType: string
): string => {
  const parsed = parseFieldType(fieldType);
  const typeMapper = TypeMapper.create(databaseType);
  return typeMapper.mapType(parsed);
};

// 辅助函数：处理UNSIGNED后缀
const parseUnsigned = (type: string): { clean: string; isUnsigned: boolean } => {
  const isUnsigned = type.toLowerCase().endsWith("unsigned");
  const clean = isUnsigned ? type.replace(/\s+unsigned$/gi, "").trim() : type;
  return { clean, isUnsigned };
};

// 辅助函数：提取类型名称和参数
const extractTypeAndArgs = (type: string): { baseType: string; args: string[] } | null => {
  const match = type.match(/^([a-z0-9_\s]+)(?:\(([^)]*)\))?$/i);
  if (!match) return null;

  const [, baseType, argString] = match;
  const cleanBaseType = baseType.trim().toLowerCase();
  const args = argString ? argString.split(",").map(arg => arg.trim()) : [];

  return { baseType: cleanBaseType, args };
};

// 辅助函数：处理特殊情况
const handleSpecialCases = (type: string): ParsedFieldType => {
  // 处理空字符串
  if (type === "") {
    return {
      baseType: "",
      args: [],
      unsigned: false,
      raw: "",
    };
  }

  // 处理 "()"
  if (type === "()") {
    return {
      baseType: "",
      args: [],
      unsigned: false,
      raw: "()",
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
  return args.map(arg => arg.toLowerCase().trim() === "max" ? "max" : arg.trim());
};

// 辅助函数：创建空字段类型
const createEmptyField = (): ParsedFieldType => ({
  baseType: "",
  args: [],
  unsigned: false,
  raw: "",
});

export const parseFieldType = (rawType: string): ParsedFieldType => {
  const clean = rawType.trim();

  // 处理空字符串
  if (clean === "") {
    return createEmptyField();
  }

  // 处理UNSIGNED后缀
  const { clean: withoutUnsigned, isUnsigned } = parseUnsigned(clean);

  // 尝试提取类型名称和参数
  const extracted = extractTypeAndArgs(withoutUnsigned);

  if (!extracted) {
    // 处理特殊情况（如 "()" 或 "varchar255)"）
    const specialCase = handleSpecialCases(clean);
    return { ...specialCase, unsigned: isUnsigned };
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
  new Set(["tinyint", "smallint", "int", "integer", "bigint"]).has(canonical);

const isNumericType = (canonical: string) =>
  new Set([
    "tinyint",
    "smallint",
    "int",
    "integer",
    "bigint",
    "decimal",
    "number",
    "numeric",
    "real",
    "double",
    "float",
  ]).has(canonical);

const isCharacterType = (canonical: string) =>
  new Set([
    "char",
    "varchar",
    "text",
    "nchar",
    "nvarchar",
    "longtext",
    "mediumtext",
    "tinytext",
    "clob",
    "varchar2",
    "nvarchar2",
  ]).has(canonical);

export const supportsUuidDefault = (canonical: string) => isCharacterType(canonical);

export const supportsAutoIncrement = (db: DatabaseType, canonical: string) => {
  switch (db) {
    case "mysql":
      return isIntegerType(canonical);
    case "postgresql":
      return new Set(["smallint", "int", "integer", "bigint"]).has(canonical);
    case "sqlserver":
      return new Set(["tinyint", "smallint", "int", "bigint"]).has(canonical);
    case "oracle":
      return isNumericType(canonical);
    default:
      return false;
  }
};

export const supportsDefaultCurrentTimestamp = (db: DatabaseType, canonical: string) => {
  switch (db) {
    case "mysql":
      return new Set(["timestamp", "datetime"]).has(canonical);
    case "postgresql":
      return new Set(["timestamp", "timestamptz"]).has(canonical);
    case "sqlserver":
      return new Set([
        "datetime",
        "datetime2",
        "datetimeoffset",
        "timestamp",
      ]).has(canonical);
    case "oracle":
      return new Set(["timestamp", "date"]).has(canonical);
    default:
      return false;
  }
};

export const supportsOnUpdateCurrentTimestamp = (db: DatabaseType, canonical: string) => {
  switch (db) {
    case "mysql":
      return new Set(["timestamp"]).has(canonical);
    default:
      return false;
  }
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
  const testValue = value !== undefined ? value : "test";

  if (!testValue || !testValue.trim()) return false;
  if (isCharacterType(canonical)) return true;
  if (["date", "time", "timestamp", "datetime", "datetime2", "timetz", "timestamptz"].includes(canonical)) return true;
  if (["uuid", "xml", "json"].includes(canonical)) return true;
  if (["jsonb"].includes(canonical)) return false;
  if (["boolean", "bit"].includes(canonical)) return false;
  if (testValue.toLowerCase() === "null") return false;
  if (isLikelyFunctionOrKeyword(testValue)) return false;
  if (isNumericType(canonical)) return false;
  return true;
};

export const isLikelyFunctionOrKeyword = (value: string) => {
  if (!value) return false;

  const exactKeywords = [
    "current_timestamp",
    "now()",
    "sysdate",
    "getdate()",
    "systimestamp",
    "uuid()",
    "newid()",
    "sys_guid",
    "default_value"
  ];

  const upperValue = value.toUpperCase().trim();

  // Check for exact matches first
  if (exactKeywords.some(keyword => upperValue === keyword.toUpperCase())) {
    return true;
  }

  // Check for partial matches (but exclude specific cases)
  const partialKeywords = ["current_timestamp", "uuid", "default"];
  return partialKeywords.some(keyword => {
    const upperKeyword = keyword.toUpperCase();
    return upperValue.includes(upperKeyword) &&
           !upperValue.includes("NEXTVAL") && // Exclude this specific case
           !(upperValue.includes("GEN_RANDOM_UUID") && !upperValue.includes("(")); // Exclude gen_random_uuid without parentheses
  });
};

export const escapeSingleQuotes = (value: string) => value.replace(/'/g, "''");

export const splitQualifiedName = (raw: string) =>
  raw
    .split(".")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

export const getSchemaAndTable = (raw: string) => {
  const parts = splitQualifiedName(raw);
  if (parts.length <= 1) {
    const table = parts[0] ?? raw.trim();
    return { schema: "", table };
  }
  return {
    schema: parts.slice(0, -1).join("."),
    table: parts[parts.length - 1],
  };
};