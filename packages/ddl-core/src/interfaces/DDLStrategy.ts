import type {
  DatabaseType,
  NormalizedField,
  IndexDefinition,
  SqlFormatMode,
  TableMiscConfig,
  ForeignKeyDefinition,
  CitusShardingConfig,
  MysqlPartitionConfig,
} from '@ddlbuilder/shared-types';

export interface TableFeatureConfig {
  tableMiscConfig?: TableMiscConfig;
  mysqlPartitionConfig?: MysqlPartitionConfig;
  citusShardingConfig?: CitusShardingConfig;
}

export interface ConfiguredTableDDL {
  tableDDL: string;
  trailingStatements: string[];
}

export interface DDLStrategy {
  /**
   * 生成表的CREATE DDL语句
   */
  generateTableDDL(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    tableMiscConfig?: TableMiscConfig,
    sqlFormatMode?: SqlFormatMode,
  ): string;

  /**
   * 生成索引的DDL语句
   */
  generateIndexDDL(tableName: string, index: IndexDefinition, fields: NormalizedField[]): string;

  /**
   * 生成外键约束的DDL语句
   */
  generateForeignKeyDDL(tableName: string, fk: ForeignKeyDefinition): string;

  applyTableFeatures(
    tableName: string,
    tableDDL: string,
    config: TableFeatureConfig,
  ): ConfiguredTableDDL;

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
