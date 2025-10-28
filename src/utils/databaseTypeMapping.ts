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

export const parseFieldType = (rawType: string): ParsedFieldType => {
  const clean = rawType.trim().toLowerCase();

  // 处理UNSIGNED后缀（MySQL特有）
  const isUnsigned = clean.includes("unsigned");
  const withoutUnsigned = clean.replace(/\s+unsigned/g, "");

  // 提取类型名称和参数
  const match = withoutUnsigned.match(/^([a-z0-9_]+)(?:\(([^)]+)\))?$/i);
  if (!match) {
    return {
      baseType: clean,
      args: [],
      unsigned: isUnsigned,
      raw: rawType.trim(),
    };
  }

  const [, baseType, argString] = match;
  const args = argString
    ? argString.split(",").map(arg => arg.trim())
    : [];

  return {
    baseType,
    args,
    unsigned: isUnsigned,
    raw: rawType.trim(),
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
  const shouldQuote = shouldQuoteDefault(canonical, value);
  const v = isLikelyFunctionOrKeyword(value) ? value : shouldQuote ? `'${value}'` : value;
  return shouldQuote ? ` DEFAULT '${v}'` : ` DEFAULT ${v}`;
};

export const shouldQuoteDefault = (canonical: string, value: string) => {
  if (isCharacterType(canonical)) return true;
  if (value.toLowerCase() === "null") return false;
  if (isLikelyFunctionOrKeyword(value)) return false;
  if (isNumericType(canonical)) return false;
  return true;
};

export const isLikelyFunctionOrKeyword = (value: string) => {
  const keywords = [
    "current_timestamp",
    "now",
    "sysdate",
    "getdate",
    "systimestamp",
    "uuid",
    "gen_random_uuid",
    "newid",
    "sys_guid",
  ];
  return keywords.some((keyword) => value.toLowerCase().includes(keyword));
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