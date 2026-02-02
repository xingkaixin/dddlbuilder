import type { NormalizedField } from '../types';
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

/**
 * 南大通用数据库（GBase）DDL 策略
 *
 * 南大通用是国产数据库，兼容 MySQL 协议，具有以下特性：
 * - 支持 AUTO_INCREMENT 自增列语法
 * - 支持分区表配置
 * - 使用 COMMENT 添加表和列注释
 * - 兼容 MySQL 大部分语法
 *
 * 参考资料：
 * - https://www.gbasestore.com/
 */
export class GBaseStrategy extends AbstractDDLStrategy {
  getDatabaseType(): 'gbase' {
    return 'gbase';
  }

  generateTableDDL(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
  ): string {
    const dbType = this.getDatabaseType();
    const typeMapper = this.createTypeMapper();
    const columnLines = fields.map((field) => {
      const parsedType = parseFieldType(field.type);
      const type = typeMapper.mapType(parsedType);
      const base = getCanonicalBaseType(field.type);

      const autoInc =
        field.defaultKind === 'auto_increment' &&
        supportsAutoIncrement(dbType, base)
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
        field.onUpdate === 'current_timestamp' &&
        supportsOnUpdateCurrentTimestamp(dbType, base)
          ? ' ON UPDATE CURRENT_TIMESTAMP'
          : '';

      const comment = field.comment
        ? ` COMMENT '${escapeSingleQuotes(field.comment)}'`
        : '';

      return `  ${this.formatFieldName(
        field.name,
      )} ${type}${autoInc}${nullable}${def}${onUpd}${comment}`;
    });

    const commentClause = tableComment
      ? ` COMMENT='${escapeSingleQuotes(tableComment.trim())}'`
      : '';

    return `CREATE TABLE ${this.formatTableName(tableName)} (\n${columnLines.join(
      ',\n',
    )}\n)${commentClause};`;
  }
}
