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
  generateTableDDL(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    tableMiscConfig?: TableMiscConfig,
    sqlFormatMode?: SqlFormatMode,
    indexes?: IndexDefinition[],
  ): string;

  generateForeignKeyDDL(tableName: string, fk: ForeignKeyDefinition): string;

  applyTableFeatures(
    tableName: string,
    tableDDL: string,
    config: TableFeatureConfig,
  ): ConfiguredTableDDL;

  formatTableName(tableName: string): string;

  formatFieldName(fieldName: string): string;

  getDatabaseType(): DatabaseType;
}
