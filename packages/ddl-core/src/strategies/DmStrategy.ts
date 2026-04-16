import type { NormalizedField, SqlFormatMode } from '@ddlbuilder/shared-types';
import {
  getCanonicalBaseType,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsUuidDefault,
  formatConstantDefault,
  escapeSingleQuotes,
  parseFieldType,
} from '../utils/databaseTypeMapping';
import { AbstractDDLStrategy } from './AbstractDDLStrategy';

/**
 * 达梦数据库（DM Database）DDL 策略
 *
 * 达梦数据库是中国国产数据库，具有以下特性：
 * - 支持 IDENTITY(种子, 增量) 自增列语法
 * - 支持 SYSDATE 函数获取当前时间
 * - 使用 COMMENT ON 语法添加注释（类似 Oracle）
 * - DATE 类型包含时分秒（与 MySQL 不同）
 * - 标识符使用双引号转义保留关键字
 *
 * 参考资料：
 * - https://eco.dameng.com/document/dm/zh-cn/pm/definition-statement.html
 */
export class DmStrategy extends AbstractDDLStrategy {
  getDatabaseType(): 'dm' {
    return 'dm';
  }

  generateTableDDL(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    _tableMiscConfig?: undefined,
    sqlFormatMode: SqlFormatMode = 'compact',
  ): string {
    const typeMapper = this.createTypeMapper();
    const columns = fields.map((field) => {
      const parsedType = parseFieldType(field.type);
      const type = typeMapper.mapType(parsedType);
      const base = getCanonicalBaseType(field.type);

      // 自增列：达梦使用 IDENTITY(种子, 增量) 语法
      const identity =
        field.defaultKind === 'auto_increment' && supportsAutoIncrement('dm', base)
          ? ' IDENTITY(1,1)'
          : '';

      // 默认值处理
      let def = '';
      if (field.defaultKind === 'constant') {
        def = formatConstantDefault(base, field.defaultValue);
      } else if (
        field.defaultKind === 'current_timestamp' &&
        supportsDefaultCurrentTimestamp('dm', base)
      ) {
        // 达梦支持 SYSDATE 函数（类似 Oracle）
        def = ' DEFAULT SYSDATE';
      } else if (field.defaultKind === 'uuid' && supportsUuidDefault(base)) {
        // 达梦使用 SYS_GUID() 生成 UUID
        def = ' DEFAULT SYS_GUID()';
      }

      // 达梦数据库：NOT NULL 必须在 DEFAULT 之前，nullable 字段显示 NULL
      const nullableClause = field.nullable ? ' NULL' : ' NOT NULL';

      return {
        name: this.formatFieldName(field.name),
        body: `${type}${identity}${nullableClause}${def}`,
      };
    });
    const columnLines = this.renderColumnDefinitions(columns, sqlFormatMode);

    const qualifiedTableName = this.formatTableName(tableName);
    const statements: string[] = [
      `CREATE TABLE ${qualifiedTableName} (\n${columnLines.join(',\n')}\n);`,
    ];

    // 表注释（Oracle 风格的 COMMENT ON 语法）
    if (tableComment.trim()) {
      statements.push(
        `COMMENT ON TABLE ${qualifiedTableName} IS '${escapeSingleQuotes(tableComment.trim())}';`,
      );
    }

    // 列注释（复用基类的 Oracle 风格实现）
    statements.push(...this.generateColumnCommentsDDL(tableName, fields));

    return statements.join('\n');
  }
}
