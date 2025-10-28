import type { NormalizedField, IndexDefinition } from "../types";
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
import { AbstractDDLStrategy } from "./AbstractDDLStrategy";

export class MySqlStrategy extends AbstractDDLStrategy {
  getDatabaseType(): "mysql" {
    return "mysql";
  }

  generateTableDDL(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[]
  ): string {
    const typeMapper = this.createTypeMapper();
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
}