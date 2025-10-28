import type {
  DatabaseType,
  NormalizedField,
  IndexDefinition,
} from "../types";
import {
  getFieldTypeForDatabase,
  parseFieldType,
  canonicalizeBaseType,
  getCanonicalBaseType,
} from "./databaseTypeMapping";

const escapeSingleQuotes = (value: string) => value.replace(/'/g, "''");

const quoteMysql = (identifier: string) => identifier;
const quotePostgres = (identifier: string) => identifier;
const quoteSqlServer = (identifier: string) => identifier;

const splitQualifiedName = (raw: string) =>
  raw
    .split(".")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const getSchemaAndTable = (raw: string) => {
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

const formatMysqlTableName = (raw: string) => {
  const parts = splitQualifiedName(raw);
  if (parts.length === 0) {
    return raw.trim();
  }
  return parts.join(".");
};

const formatPostgresTableName = (raw: string) => {
  const parts = splitQualifiedName(raw);
  if (parts.length === 0) {
    return raw.trim();
  }
  return parts.join(".");
};

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

const supportsUuidDefault = (canonical: string) => isCharacterType(canonical);

const supportsAutoIncrement = (db: DatabaseType, canonical: string) => {
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

const supportsDefaultCurrentTimestamp = (
  db: DatabaseType,
  canonical: string
) => {
  switch (db) {
    case "mysql":
      return new Set(["timestamp", "datetime"]).has(canonical);
    case "postgresql":
      return new Set(["timestamp", "timestamptz"]).has(canonical);
    case "sqlserver":
      return new Set(["datetime", "datetime2"]).has(canonical);
    case "oracle":
      return new Set(["timestamp"]).has(canonical);
    default:
      return false;
  }
};

const supportsOnUpdateCurrentTimestamp = (
  db: DatabaseType,
  canonical: string
) => {
  if (db !== "mysql") return false;
  return new Set(["timestamp", "datetime"]).has(canonical);
};

const shouldQuoteDefault = (canonical: string) => {
  const texty = new Set([
    "char",
    "nchar",
    "varchar",
    "nvarchar",
    "text",
    "mediumtext",
    "longtext",
    "uuid",
    "xml",
    "json",
    "clob",
    "varchar2",
    "nvarchar2",
  ]);
  const datetimey = new Set([
    "date",
    "time",
    "timetz",
    "timestamp",
    "timestamptz",
    "datetime",
    "datetime2",
  ]);
  return texty.has(canonical) || datetimey.has(canonical);
};

const isLikelyFunctionOrKeyword = (value: string) => {
  const v = value.trim();
  if (!v) return false;
  if (/[()]/.test(v)) return true;
  return /^[A-Z_][A-Z0-9_]*$/.test(v);
};

const formatConstantDefault = (canonical: string, value: string) => {
  const v = value.trim();
  if (!v) return "";
  if (isLikelyFunctionOrKeyword(v)) return ` DEFAULT ${v}`;
  if (shouldQuoteDefault(canonical))
    return ` DEFAULT '${escapeSingleQuotes(v)}'`;
  return ` DEFAULT ${v}`;
};


export const buildMysqlDDL = (
  tableName: string,
  tableComment: string,
  fields: NormalizedField[]
) => {
  const columnLines = fields.map((field) => {
    const type = getFieldTypeForDatabase("mysql", field.type);
    const base = getCanonicalBaseType(field.type);
    const autoInc =
      field.defaultKind === "auto_increment" &&
      supportsAutoIncrement("mysql", base)
        ? " AUTO_INCREMENT"
        : "";
    const nullable = field.nullable ? " NULL" : " NOT NULL";
    let def = "";
    if (field.defaultKind === "constant") {
      def = formatConstantDefault(base, field.defaultValue);
    } else if (
      field.defaultKind === "current_timestamp" &&
      supportsDefaultCurrentTimestamp("mysql", base)
    ) {
      def = " DEFAULT CURRENT_TIMESTAMP";
    } else if (field.defaultKind === "uuid" && supportsUuidDefault(base)) {
      def = " DEFAULT UUID()";
    }
    const onUpd =
      field.onUpdate === "current_timestamp" &&
      supportsOnUpdateCurrentTimestamp("mysql", base)
        ? " ON UPDATE CURRENT_TIMESTAMP"
        : "";
    const comment = field.comment
      ? ` COMMENT '${escapeSingleQuotes(field.comment)}'`
      : "";
    return `  ${quoteMysql(
      field.name
    )} ${type}${autoInc}${nullable}${def}${onUpd}${comment}`;
  });
  const commentClause = tableComment
    ? ` COMMENT='${escapeSingleQuotes(tableComment.trim())}'`
    : "";
  return `CREATE TABLE ${formatMysqlTableName(tableName)} (\n${columnLines.join(
    ",\n"
  )}\n)${commentClause};`;
};

export const buildPostgresDDL = (
  tableName: string,
  tableComment: string,
  fields: NormalizedField[]
) => {
  const columnLines = fields.map((field) => {
    const type = getFieldTypeForDatabase("postgresql", field.type);
    const base = getCanonicalBaseType(field.type);
    const identity =
      field.defaultKind === "auto_increment" &&
      supportsAutoIncrement("postgresql", base)
        ? " GENERATED BY DEFAULT AS IDENTITY"
        : "";
    const nullableClause = field.nullable ? "" : " NOT NULL";
    let def = "";
    if (field.defaultKind === "constant") {
      def = formatConstantDefault(base, field.defaultValue);
    } else if (
      field.defaultKind === "current_timestamp" &&
      supportsDefaultCurrentTimestamp("postgresql", base)
    ) {
      def = " DEFAULT CURRENT_TIMESTAMP";
    } else if (field.defaultKind === "uuid" && supportsUuidDefault(base)) {
      def = " DEFAULT gen_random_uuid()";
    }
    return `  ${quotePostgres(
      field.name
    )} ${type}${identity}${nullableClause}${def}`;
  });
  const qualifiedTableName = formatPostgresTableName(tableName);
  const statements: string[] = [
    `CREATE TABLE ${qualifiedTableName} (\n${columnLines.join(",\n")}\n);`,
  ];
  if (tableComment.trim()) {
    statements.push(
      `COMMENT ON TABLE ${qualifiedTableName} IS '${escapeSingleQuotes(
        tableComment.trim()
      )}';`
    );
  }
  fields
    .filter((field) => field.comment)
    .forEach((field) => {
      statements.push(
        `COMMENT ON COLUMN ${qualifiedTableName}.${quotePostgres(
          field.name
        )} IS '${escapeSingleQuotes(field.comment)}';`
      );
    });
  return statements.join("\n");
};

export const buildSqlServerDDL = (
  tableName: string,
  tableComment: string,
  fields: NormalizedField[]
) => {
  const { schema: parsedSchema, table: parsedTable } =
    getSchemaAndTable(tableName);
  const schema = parsedSchema || "";
  const table = parsedTable || tableName.trim();
  const columnLines = fields.map((field) => {
    const type = getFieldTypeForDatabase("sqlserver", field.type);
    const base = getCanonicalBaseType(field.type);
    const identity =
      field.defaultKind === "auto_increment" &&
      supportsAutoIncrement("sqlserver", base)
        ? " IDENTITY(1,1)"
        : "";
    const nullableClause = field.nullable ? " NULL" : " NOT NULL";
    let def = "";
    if (field.defaultKind === "constant") {
      def = formatConstantDefault(base, field.defaultValue);
    } else if (
      field.defaultKind === "current_timestamp" &&
      supportsDefaultCurrentTimestamp("sqlserver", base)
    ) {
      def = " DEFAULT GETDATE()";
    } else if (field.defaultKind === "uuid" && supportsUuidDefault(base)) {
      def = " DEFAULT NEWID()";
    }
    return `  ${quoteSqlServer(
      field.name
    )} ${type}${identity}${nullableClause}${def}`;
  });
  const qualified = schema ? `${schema}.${table}` : table;
  const statements: string[] = [
    `CREATE TABLE ${qualified} (\n${columnLines.join(",\n")}\n);`,
  ];
  if (tableComment.trim()) {
    const level0name = schema
      ? `N'${escapeSingleQuotes(schema)}'`
      : "SCHEMA_NAME()";
    statements.push(
      `EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'${escapeSingleQuotes(
        tableComment.trim()
      )}', @level0type = N'SCHEMA', @level0name = ${level0name}, @level1type = N'TABLE', @level1name = N'${escapeSingleQuotes(
        table
      )}';`
    );
  }
  fields
    .filter((field) => field.comment)
    .forEach((field) => {
      const level0name = schema
        ? `N'${escapeSingleQuotes(schema)}'`
        : "SCHEMA_NAME()";
      statements.push(
        `EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'${escapeSingleQuotes(
          field.comment
        )}', @level0type = N'SCHEMA', @level0name = ${level0name}, @level1type = N'TABLE', @level1name = N'${escapeSingleQuotes(
          table
        )}', @level2type = N'COLUMN', @level2name = N'${escapeSingleQuotes(
          field.name
        )}';`
      );
    });
  return statements.join("\n");
};

export const buildOracleDDL = (
  tableName: string,
  tableComment: string,
  fields: NormalizedField[],
  includeSynonyms: boolean = true
) => {
  const columnLines = fields.map((field) => {
    const type = getFieldTypeForDatabase("oracle", field.type);
    const base = getCanonicalBaseType(field.type);
    const identity =
      field.defaultKind === "auto_increment" &&
      supportsAutoIncrement("oracle", base)
        ? " GENERATED BY DEFAULT AS IDENTITY"
        : "";
    let def = "";
    if (field.defaultKind === "constant") {
      def = formatConstantDefault(base, field.defaultValue);
    } else if (
      field.defaultKind === "current_timestamp" &&
      supportsDefaultCurrentTimestamp("oracle", base)
    ) {
      def = " DEFAULT SYSTIMESTAMP";
    } else if (field.defaultKind === "uuid" && supportsUuidDefault(base)) {
      def = " DEFAULT SYS_GUID()";
    }
    const nullableClause = field.nullable ? "" : " NOT NULL";
    return `  ${quotePostgres(
      field.name
    )} ${type}${identity}${def}${nullableClause}`;
  });
  const qualifiedTableName = formatPostgresTableName(tableName);
  const statements: string[] = [
    `CREATE TABLE ${qualifiedTableName} (\n${columnLines.join(",\n")}\n);`,
  ];
  if (tableComment.trim()) {
    statements.push(
      `COMMENT ON TABLE ${qualifiedTableName} IS '${escapeSingleQuotes(
        tableComment.trim()
      )}';`
    );
  }
  fields
    .filter((field) => field.comment)
    .forEach((field) => {
      statements.push(
        `COMMENT ON COLUMN ${qualifiedTableName}.${quotePostgres(
          field.name
        )} IS '${escapeSingleQuotes(field.comment)}';`
      );
    });

  // Add synonym generation
  if (includeSynonyms) {
    const synonymStatement = buildOracleSynonyms(qualifiedTableName);
    if (synonymStatement) {
      statements.push(synonymStatement);
    }
  }

  return statements.join("\n");
};

export const buildOracleSynonyms = (tableName: string) => {
  const cleanTableName = tableName.trim();
  if (!cleanTableName) return "";

  return `CREATE OR REPLACE PUBLIC SYNONYM ${cleanTableName} FOR ${cleanTableName};`;
};

export const buildDDL = (
  dbType: DatabaseType,
  tableName: string,
  tableComment: string,
  fields: NormalizedField[],
  indexes: IndexDefinition[] = []
) => {
  if (!tableName.trim()) {
    return "-- 请填写表名";
  }
  if (fields.length === 0) {
    return "-- 请补充字段信息";
  }
  const tableDDL = (() => {
    switch (dbType) {
      case "mysql":
        return buildMysqlDDL(tableName.trim(), tableComment, fields);
      case "postgresql":
        return buildPostgresDDL(tableName.trim(), tableComment, fields);
      case "sqlserver":
        return buildSqlServerDDL(tableName.trim(), tableComment, fields);
      case "oracle":
        return buildOracleDDL(tableName.trim(), tableComment, fields);
      default:
        return "";
    }
  })();

  // Build index DDL statements
  const indexDDLs = indexes.map((index) => {
    // Skip primary keys as they are handled differently
    if (index.isPrimary) {
      const fieldList = index.fields.map((f) => f.name).join(", ");

      switch (dbType) {
        case "mysql":
          return `ALTER TABLE ${tableName.trim()} ADD PRIMARY KEY (${fieldList});`;
        case "postgresql":
          return `ALTER TABLE ${formatPostgresTableName(
            tableName.trim()
          )} ADD PRIMARY KEY (${fieldList});`;
        case "sqlserver":
          return `ALTER TABLE ${formatMysqlTableName(
            tableName.trim()
          )} ADD PRIMARY KEY (${fieldList});`;
        case "oracle":
          return `ALTER TABLE ${formatPostgresTableName(
            tableName.trim()
          )} ADD PRIMARY KEY (${fieldList});`;
        default:
          return "";
      }
    }

    const indexType = index.unique ? "UNIQUE INDEX" : "INDEX";
    const fieldList = index.fields
      .map((f) => `${f.name} ${f.direction}`)
      .join(", ");

    switch (dbType) {
      case "mysql":
        return `CREATE ${indexType} ${
          index.name
        } ON ${tableName.trim()} (${fieldList});`;
      case "postgresql":
        return `CREATE ${indexType} ${index.name} ON ${formatPostgresTableName(
          tableName.trim()
        )} (${fieldList});`;
      case "sqlserver": {
        const qualifiedName = formatMysqlTableName(tableName.trim());
        return `CREATE ${indexType} ${index.name} ON ${qualifiedName} (${fieldList});`;
      }
      case "oracle":
        return `CREATE ${indexType} ${index.name} ON ${formatPostgresTableName(
          tableName.trim()
        )} (${fieldList});`;
      default:
        return "";
    }
  });

  return indexDDLs.length > 0
    ? `${tableDDL}\n\n${indexDDLs.join("\n")}`
    : tableDDL;
};

export const buildDCL = (
  dbType: DatabaseType,
  tableName: string,
  authorizationObjects: string[]
) => {
  if (!tableName.trim() || authorizationObjects.length === 0) {
    return "";
  }

  const cleanTableName = tableName.trim();
  const statements: string[] = [];

  switch (dbType) {
    case "oracle":
      authorizationObjects.forEach((authObj) => {
        if (authObj.trim()) {
          statements.push(
            `GRANT SELECT ON ${cleanTableName} TO ${authObj.trim()};`
          );
        }
      });
      break;
    case "mysql":
      authorizationObjects.forEach((authObj) => {
        if (authObj.trim()) {
          statements.push(
            `GRANT SELECT ON ${cleanTableName} TO '${authObj.trim()}'@'%';`
          );
        }
      });
      break;
    case "postgresql":
      authorizationObjects.forEach((authObj) => {
        if (authObj.trim()) {
          statements.push(
            `GRANT SELECT ON ${cleanTableName} TO ${authObj.trim()};`
          );
        }
      });
      break;
    case "sqlserver":
      authorizationObjects.forEach((authObj) => {
        if (authObj.trim()) {
          statements.push(
            `GRANT SELECT ON ${cleanTableName} TO ${authObj.trim()};`
          );
        }
      });
      break;
    default:
      return "";
  }

  return statements.join("\n");
};

// 导出内部工具函数
export {
  escapeSingleQuotes,
  formatConstantDefault,
  shouldQuoteDefault,
  isLikelyFunctionOrKeyword,
  splitQualifiedName,
  getSchemaAndTable,
  formatMysqlTableName,
  formatPostgresTableName
};