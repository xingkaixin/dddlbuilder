import {
  normalizeMysqlPartitionCount,
  type CitusShardingConfig,
  type MysqlPartitionConfig,
} from '@ddlbuilder/shared-types';

export const buildCitusShardingDDL = (tableName: string, config: CitusShardingConfig): string => {
  const cleanTableName = tableName.trim();
  if (config.mode === 'reference') {
    return `SELECT create_reference_table('${cleanTableName}');`;
  }
  if (config.distributionColumn) {
    return `SELECT create_distributed_table('${cleanTableName}', '${config.distributionColumn}');`;
  }
  return '-- 请选择分片字段';
};

export const buildMysqlPartitionClause = (config: MysqlPartitionConfig): string => {
  const partitionKey = config.expression || config.columns.join(', ');
  if (!config.enabled || !partitionKey) return '';

  switch (config.type) {
    case 'HASH':
      return `\nPARTITION BY HASH(${partitionKey})\nPARTITIONS ${normalizeMysqlPartitionCount(config.partitionCount)}`;
    case 'KEY':
      return `\nPARTITION BY KEY(${partitionKey})\nPARTITIONS ${normalizeMysqlPartitionCount(config.partitionCount)}`;
    case 'RANGE':
    case 'RANGE COLUMNS':
    case 'LIST':
    case 'LIST COLUMNS': {
      if (!config.partitions || config.partitions.length === 0) {
        return '\n-- 请添加分区定义';
      }

      const isRange = config.type.startsWith('RANGE');
      const definitions = config.partitions
        .map((partition) => {
          const values = isRange
            ? `VALUES LESS THAN (${partition.value})`
            : `VALUES IN (${partition.value})`;
          return `  PARTITION ${partition.name} ${values}`;
        })
        .join(',\n');

      return `\nPARTITION BY ${config.type}(${partitionKey}) (\n${definitions}\n)`;
    }
    default:
      return '';
  }
};

export const buildOracleSynonyms = (tableName: string): string => {
  const cleanTableName = tableName.trim();
  if (!cleanTableName) return '';
  return `CREATE OR REPLACE PUBLIC SYNONYM ${cleanTableName} FOR ${cleanTableName};`;
};

export const insertTableOptions = (ddl: string, clause: string): string => {
  if (!clause) return ddl;
  const createIndex = ddl.indexOf('CREATE TABLE');
  if (createIndex === -1) return ddl;
  const afterCreate = ddl.slice(createIndex);
  const semiIndex = afterCreate.indexOf(';');
  if (semiIndex === -1) return ddl;
  const before = ddl.slice(0, createIndex);
  const createStatement = afterCreate.slice(0, semiIndex);
  const rest = afterCreate.slice(semiIndex);
  return `${before}${createStatement}${clause}${rest}`;
};
