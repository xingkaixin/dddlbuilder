import type { NormalizedField, IndexDefinition } from "../types";
import type { DDLStrategy } from "../interfaces/DDLStrategy";
import {
  getCanonicalBaseType,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsUuidDefault,
  formatConstantDefault,
  shouldQuoteDefault,
  isLikelyFunctionOrKeyword,
  escapeSingleQuotes,
  splitQualifiedName,
  getSchemaAndTable,
  parseFieldType,
} from "../utils/databaseTypeMapping";
import { TypeMapper } from "../utils/TypeMapper";

export class SqlServerStrategy implements DDLStrategy {
  getDatabaseType(): "sqlserver" {
    return "sqlserver";
  }

  formatTableName(tableName: string): string {
    const parts = splitQualifiedName(tableName);
    if (parts.length === 0) {
      return tableName.trim();
    }
    return parts.join(".");
  }

  formatFieldName(fieldName: string): string {
    return fieldName;
  }

  generateTableDDL(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[]
  ): string {
    const { schema: parsedSchema, table: parsedTable } = getSchemaAndTable(tableName);
    const schema = parsedSchema || "";
    const table = parsedTable || tableName.trim();

    const typeMapper = TypeMapper.create("sqlserver");
    const columnLines = fields.map((field) => {
      const parsedType = parseFieldType(field.type);
      const type = typeMapper.mapType(parsedType);
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

      return `  ${this.formatFieldName(field.name)} ${type}${identity}${nullableClause}${def}`;
    });

    const qualified = schema ? `${schema}.${table}` : table;
    const statements: string[] = [
      `CREATE TABLE ${qualified} (\n${columnLines.join(",\n")}\n);`,
    ];

    if (tableComment.trim()) {
      const level0name = schema
        ? `N'${escapeSingleQuotes(schema)}'`
        : "NULL";
      const level1name = schema
        ? `N'${escapeSingleQuotes(table)}'`
        : `N'${escapeSingleQuotes(table)}'`;
      const level2type = schema ? "N'COLUMN'" : "N'TABLE'";

      statements.push(
        `EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'${escapeSingleQuotes(tableComment.trim())}',
    @level0type = N'SCHEMA', @level0name = ${level0name},
    @level1type = ${level2type}, @level1name = ${level1name};`
      );
    }

    fields
      .filter((field) => field.comment)
      .forEach((field) => {
        const level0name = schema
          ? `N'${escapeSingleQuotes(schema)}'`
          : "NULL";
        const level1name = schema
          ? `N'${escapeSingleQuotes(table)}'`
          : `N'${escapeSingleQuotes(table)}'`;
        const level2name = `N'${escapeSingleQuotes(field.name)}'`;

        statements.push(
          `EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'${escapeSingleQuotes(field.comment)}',
    @level0type = N'SCHEMA', @level0name = ${level0name},
    @level1type = N'TABLE', @level1name = ${level1name},
    @level2type = N'COLUMN', @level2name = ${level2name};`
        );
      });

    return statements.join("\n");
  }

  generateIndexDDL(
    tableName: string,
    index: IndexDefinition,
    fields: NormalizedField[]
  ): string {
    // Skip primary keys as they are handled differently
    if (index.isPrimary) {
      const fieldList = index.fields.map((f) => f.name).join(", ");
      return `ALTER TABLE ${this.formatTableName(tableName)} ADD PRIMARY KEY (${fieldList});`;
    }

    const indexType = index.unique ? "UNIQUE INDEX" : "INDEX";
    const fieldList = index.fields
      .map((f) => `${f.name} ${f.direction}`)
      .join(", ");

    const qualifiedName = this.formatTableName(tableName);
    return `CREATE ${indexType} ${index.name} ON ${qualifiedName} (${fieldList});`;
  }
}