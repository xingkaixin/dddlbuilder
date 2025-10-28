import type { DatabaseType, NormalizedField, IndexDefinition } from "../types";

export interface DDLStrategy {
  /**
   * 生成表的CREATE DDL语句
   */
  generateTableDDL(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[]
  ): string;

  /**
   * 生成索引的DDL语句
   */
  generateIndexDDL(
    tableName: string,
    index: IndexDefinition,
    fields: NormalizedField[]
  ): string;

  /**
   * 格式化表名（处理schema、引号等）
   */
  formatTableName(tableName: string): string;

  /**
   * 格式化字段名（添加引号等）
   */
  formatFieldName(fieldName: string): string;

  /**
   * 获取数据库类型
   */
  getDatabaseType(): DatabaseType;
}