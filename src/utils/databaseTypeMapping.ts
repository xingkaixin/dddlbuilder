import type { DatabaseType, ParsedFieldType } from "../types";

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

const formatType = (base: string, args: string[] = [], suffix = "") => {
  const formattedArgs = args.map(uppercaseArg);
  const joined = formattedArgs.join(", ");
  const typeCore = joined
    ? `${base.toUpperCase()}(${joined})`
    : base.toUpperCase();
  return suffix ? `${typeCore} ${suffix}` : typeCore;
};

const uppercaseArg = (value: string) =>
  value.toLowerCase() === "max" ? "MAX" : value;

const ensureLength = (args: string[], fallback: string) => {
  if (args.length === 0) {
    return [fallback];
  }
  return args;
};

export const canonicalizeBaseType = (baseType: string) =>
  TYPE_ALIASES[baseType] ?? baseType;

export const mapTypeForMysql = (parsed: ParsedFieldType, canonical: string) => {
  switch (canonical) {
    case "varchar":
      return formatType("varchar", ensureLength(parsed.args, "255"));
    case "nvarchar":
      return formatType("varchar", ensureLength(parsed.args, "255"));
    case "char":
      return formatType("char", ensureLength(parsed.args, "1"));
    case "nchar":
      return formatType("char", ensureLength(parsed.args, "1"));
    case "text":
      return formatType("text");
    case "mediumtext":
      return formatType("mediumtext");
    case "longtext":
      return formatType("longtext");
    case "int":
      return formatType("int", [], parsed.unsigned ? "UNSIGNED" : "").trim();
    case "tinyint":
      return formatType(
        "tinyint",
        parsed.args.length ? parsed.args : ["1"],
        parsed.unsigned ? "UNSIGNED" : ""
      ).trim();
    case "smallint":
      return formatType(
        "smallint",
        [],
        parsed.unsigned ? "UNSIGNED" : ""
      ).trim();
    case "bigint":
      return formatType("bigint", [], parsed.unsigned ? "UNSIGNED" : "").trim();
    case "decimal": {
      const args = parsed.args.length === 0 ? ["18", "2"] : parsed.args;
      const suffix = parsed.unsigned ? "UNSIGNED" : "";
      return formatType("decimal", args, suffix).trim();
    }
    case "float":
      return formatType("float", parsed.args);
    case "double":
      return formatType("double", parsed.args);
    case "real":
      return formatType("double", parsed.args);
    case "boolean":
      return formatType("tinyint", ["1"]);
    case "bit":
      return formatType("bit", ensureLength(parsed.args, "1"));
    case "datetime2":
      return formatType("datetime", parsed.args);
    case "datetime":
      return formatType("datetime", parsed.args);
    case "timestamp":
      return formatType("timestamp", []);
    case "time":
      return formatType("time", []);
    case "timetz":
      return formatType("time", parsed.args);
    case "timestamptz":
      return formatType("timestamp", parsed.args);
    case "date":
      return formatType("date");
    case "json":
      return formatType("json");
    case "jsonb":
      return formatType("json");
    case "uuid":
      return formatType("char", ["36"]);
    case "blob":
      return formatType("blob");
    case "varbinary":
      return formatType("varbinary", parsed.args);
    case "serial":
      return `${formatType("bigint")} UNSIGNED AUTO_INCREMENT`;
    default:
      return "";
  }
};

export const mapTypeForPostgres = (parsed: ParsedFieldType, canonical: string) => {
  switch (canonical) {
    case "varchar":
      return formatType("varchar", parsed.args);
    case "nvarchar":
      return formatType("varchar", parsed.args);
    case "char":
      return formatType("char", parsed.args);
    case "nchar":
      return formatType("char", parsed.args);
    case "text":
    case "mediumtext":
    case "longtext":
      return formatType("text");
    case "int":
      return formatType("integer");
    case "tinyint":
      return formatType("smallint");
    case "smallint":
      return formatType("smallint");
    case "bigint":
      return formatType("bigint");
    case "decimal":
      return formatType(
        "numeric",
        parsed.args.length === 0 ? ["18", "2"] : parsed.args
      );
    case "float":
    case "double":
      return "DOUBLE PRECISION";
    case "real":
      return formatType("real");
    case "boolean":
    case "bit":
      return formatType("boolean");
    case "datetime":
    case "datetime2":
      return formatType("timestamp", parsed.args);
    case "timestamp":
      return formatType("timestamp", parsed.args);
    case "timestamptz":
      return `${formatType("timestamp", parsed.args)} WITH TIME ZONE`;
    case "time":
      return `${formatType("time", parsed.args)} WITHOUT TIME ZONE`;
    case "timetz":
      return `${formatType("time", parsed.args)} WITH TIME ZONE`;
    case "date":
      return formatType("date");
    case "json":
      return formatType("jsonb");
    case "jsonb":
      return formatType("jsonb");
    case "uuid":
      return formatType("uuid");
    case "serial":
      return formatType("serial");
    case "xml":
      return formatType("xml");
    default:
      return "";
  }
};

export const mapTypeForSqlServer = (parsed: ParsedFieldType, canonical: string) => {
  switch (canonical) {
    case "varchar":
      return formatType("varchar", ensureLength(parsed.args, "255"));
    case "nvarchar":
      return formatType("nvarchar", ensureLength(parsed.args, "255"));
    case "char":
      return formatType("char", ensureLength(parsed.args, "1"));
    case "nchar":
      return formatType("nchar", ensureLength(parsed.args, "1"));
    case "text":
    case "mediumtext":
    case "longtext":
      return "NVARCHAR(MAX)";
    case "int":
      return formatType("int");
    case "tinyint":
      return formatType("tinyint");
    case "smallint":
      return formatType("smallint");
    case "bigint":
      return formatType("bigint");
    case "decimal":
      return formatType(
        "decimal",
        parsed.args.length === 0 ? ["18", "2"] : parsed.args
      );
    case "float":
    case "double":
      return formatType("float", parsed.args);
    case "real":
      return formatType("real");
    case "boolean":
      return formatType("bit");
    case "bit":
      return formatType("bit");
    case "datetime":
    case "datetime2":
    case "timestamp":
      return formatType("datetime2", parsed.args);
    case "time":
    case "timetz":
      return formatType("time", parsed.args);
    case "date":
      return formatType("date");
    case "json":
    case "jsonb":
      return "NVARCHAR(MAX)";
    case "uuid":
      return formatType("uniqueidentifier");
    case "varbinary":
      return formatType(
        "varbinary",
        parsed.args.length === 0 ? ["MAX"] : parsed.args
      );
    case "serial":
      return "BIGINT IDENTITY(1,1)";
    case "xml":
      return formatType("xml");
    default:
      return "";
  }
};

export const mapTypeForOracle = (parsed: ParsedFieldType, canonical: string) => {
  switch (canonical) {
    case "varchar":
      return formatType("varchar2", ensureLength(parsed.args, "255"));
    case "nvarchar":
      return formatType("nvarchar2", ensureLength(parsed.args, "255"));
    case "char":
      return formatType("char", ensureLength(parsed.args, "1"));
    case "nchar":
      return formatType("nchar", ensureLength(parsed.args, "1"));
    case "text":
    case "mediumtext":
    case "longtext":
    case "clob":
      return "CLOB";
    case "int":
      return "NUMBER(10)";
    case "tinyint":
      return "NUMBER(3)";
    case "smallint":
      return "NUMBER(5)";
    case "bigint":
      return "NUMBER(19)";
    case "decimal":
      return formatType(
        "number",
        parsed.args.length === 0 ? ["18", "2"] : parsed.args
      );
    case "float":
      return formatType("float", parsed.args);
    case "double":
      return "BINARY_DOUBLE";
    case "real":
      return "BINARY_FLOAT";
    case "boolean":
    case "bit":
      return "NUMBER(1)";
    case "datetime":
    case "datetime2":
      return "TIMESTAMP";
    case "timestamp":
      return "TIMESTAMP";
    case "timestamptz":
      return "TIMESTAMP WITH TIME ZONE";
    case "time":
    case "timetz":
      return "TIMESTAMP";
    case "date":
      return "DATE";
    case "json":
    case "jsonb":
      return "CLOB";
    case "uuid":
      return "CHAR(36)";
    case "blob":
      return "BLOB";
    case "varbinary":
      return formatType("raw", ensureLength(parsed.args, "2000"));
    case "serial":
      return "NUMBER GENERATED ALWAYS AS IDENTITY";
    case "xml":
      return "XMLTYPE";
    default:
      return "";
  }
};

export const getFieldTypeForDatabase = (
  dbType: DatabaseType,
  rawType: string
) => {
  const parsed = parseFieldType(rawType);
  if (!parsed.baseType) {
    return rawType.trim();
  }
  const canonical = canonicalizeBaseType(parsed.baseType);
  let mapped = "";
  switch (dbType) {
    case "mysql":
      mapped = mapTypeForMysql(parsed, canonical);
      break;
    case "postgresql":
      mapped = mapTypeForPostgres(parsed, canonical);
      break;
    case "sqlserver":
      mapped = mapTypeForSqlServer(parsed, canonical);
      break;
    case "oracle":
      mapped = mapTypeForOracle(parsed, canonical);
      break;
    default:
      mapped = "";
  }
  return mapped || parsed.raw;
};

export const parseFieldType = (rawType: string): ParsedFieldType => {
  const raw = rawType.trim();
  if (!raw) {
    return { baseType: "", args: [], unsigned: false, raw };
  }

  const lower = raw.toLowerCase();
  const match = lower.match(
    /^([a-z0-9_]+(?:\s+[a-z0-9_]+)*)\s*(\(([^)]*)\))?(.*)$/
  );

  const baseTokens =
    match?.[1]
      ?.trim()
      .split(/\s+/)
      .filter((token) => token.length > 0) ?? [];
  const args =
    match?.[3]
      ?.split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0) ?? [];
  const remainder = match?.[4]?.trim() ?? "";
  const modifiers = new Set(
    remainder.split(/\s+/).filter((token) => token.length > 0)
  );

  let unsigned = modifiers.has("unsigned");
  if (baseTokens[baseTokens.length - 1] === "unsigned") {
    unsigned = true;
    baseTokens.pop();
  }

  const basePart = baseTokens.join(" ");

  return {
    baseType: basePart,
    args,
    unsigned,
    raw,
  };
};

export const getCanonicalBaseType = (rawType: string) => {
  const parsed = parseFieldType(rawType);
  return canonicalizeBaseType(parsed.baseType);
};