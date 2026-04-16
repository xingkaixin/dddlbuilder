import type { NormalizedField, SqlFormatMode } from '@ddlbuilder/shared-types';
import {
  getCanonicalBaseType,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
  supportsUuidDefault,
  formatConstantDefault,
  escapeSingleQuotes,
  parseFieldType,
} from '../utils/databaseTypeMapping';
import { AbstractDDLStrategy } from './AbstractDDLStrategy';

export class MySqlStrategy extends AbstractDDLStrategy {
  getDatabaseType(): 'mysql' {
    return 'mysql';
  }

  generateTableDDL(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    _tableMiscConfig?: undefined,
    sqlFormatMode: SqlFormatMode = 'compact',
  ): string {
    const dbType = this.getDatabaseType();
    const typeMapper = this.createTypeMapper();
    const columns = fields.map((field) => {
      const parsedType = parseFieldType(field.type);
      const type = typeMapper.mapType(parsedType);
      const base = getCanonicalBaseType(field.type);

      const autoInc =
        field.defaultKind === 'auto_increment' && supportsAutoIncrement(dbType, base)
          ? ' AUTO_INCREMENT'
          : '';

      const nullable = field.nullable ? ' NULL' : ' NOT NULL';

      let def = '';
      if (field.defaultKind === 'constant') {
        def = formatConstantDefault(base, field.defaultValue);
      } else if (field.defaultKind === 'uuid' && supportsUuidDefault(base)) {
        def = ' DEFAULT (UUID())';
      } else if (
        field.defaultKind === 'current_timestamp' &&
        supportsDefaultCurrentTimestamp(dbType, base)
      ) {
        def = ' DEFAULT CURRENT_TIMESTAMP';
      }

      const onUpd =
        field.onUpdate === 'current_timestamp' && supportsOnUpdateCurrentTimestamp(dbType, base)
          ? ' ON UPDATE CURRENT_TIMESTAMP'
          : '';

      const comment = field.comment ? ` COMMENT '${escapeSingleQuotes(field.comment)}'` : '';

      return {
        name: this.formatFieldName(field.name),
        body: `${type}${autoInc}${nullable}${def}${onUpd}`,
        comment: comment.trim() || undefined,
      };
    });
    const columnLines = this.renderColumnDefinitions(columns, sqlFormatMode);

    const commentClause = tableComment
      ? ` COMMENT='${escapeSingleQuotes(tableComment.trim())}'`
      : '';

    return `CREATE TABLE ${this.formatTableName(tableName)} (\n${columnLines.join(
      ',\n',
    )}\n)${commentClause};`;
  }
}
