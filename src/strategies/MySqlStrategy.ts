import type { NormalizedField, IndexDefinition } from "../types";
import type { DDLStrategy } from "../interfaces/DDLStrategy";
import {
  getCanonicalBaseType,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
  formatConstantDefault,
  shouldQuoteDefault,
  isLikelyFunctionOrKeyword,
  escapeSingleQuotes,
  splitQualifiedName,
  parseFieldType,
} from "../utils/databaseTypeMapping";
import { TypeMapper } from "../utils/TypeMapper";

export class MySqlStrategy implements DDLStrategy {
  getDatabaseType(): "mysql" {
    return "mysql";
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
    const typeMapper = TypeMapper.create("mysql");
    const columnLines = fields.map((field) => {
      const parsedType = parseFieldType(field.type);
      const type = typeMapper.mapType(parsedType);
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
      }

      const onUpd =
        field.onUpdate === "current_timestamp" &&
        supportsOnUpdateCurrentTimestamp("mysql", base)
          ? " ON UPDATE CURRENT_TIMESTAMP"
          : "";

      const comment = field.comment
        ? ` COMMENT '${escapeSingleQuotes(field.comment)}'`
        : "";

      return `  ${this.formatFieldName(
        field.name
      )} ${type}${autoInc}${nullable}${def}${onUpd}${comment}`;
    });

    const commentClause = tableComment
      ? ` COMMENT='${escapeSingleQuotes(tableComment.trim())}'`
      : "";

    return `CREATE TABLE ${this.formatTableName(tableName)} (\n${columnLines.join(
      ",\n"
    )}\n)${commentClause};`;
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