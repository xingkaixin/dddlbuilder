import type {
  DatabaseType,
  NormalizedField,
  IndexDefinition,
  CitusShardingConfig,
  MysqlPartitionConfig,
  SqlFormatMode,
  TableMiscConfig,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import { DDLStrategyFactory } from '../factories/DDLStrategyFactory';
import { buildTableOptionsClause } from './tableOptions';

/**
 * Generate Citus sharding DDL
 */
const buildCitusShardingDDL = (tableName: string, config: CitusShardingConfig): string => {
  const cleanTableName = tableName.trim();
  if (config.mode === 'reference') {
    return `SELECT create_reference_table('${cleanTableName}');`;
  }
  // distributed mode
  if (config.distributionColumn) {
    return `SELECT create_distributed_table('${cleanTableName}', '${config.distributionColumn}');`;
  }
  return `-- 请选择分片字段`;
};

/**
 * Generate MySQL partition DDL clause
 */
const buildMysqlPartitionClause = (config: MysqlPartitionConfig): string => {
  // 优先使用表达式，否则使用字段列表
  const partitionKey = config.expression || config.columns.join(', ');

  if (!config.enabled || !partitionKey) {
    return '';
  }

  switch (config.type) {
    case 'HASH':
      return `\nPARTITION BY HASH(${partitionKey})\nPARTITIONS ${config.partitionCount || 4}`;

    case 'KEY':
      return `\nPARTITION BY KEY(${partitionKey})\nPARTITIONS ${config.partitionCount || 4}`;

    case 'RANGE':
    case 'RANGE COLUMNS':
    case 'LIST':
    case 'LIST COLUMNS': {
      if (!config.partitions || config.partitions.length === 0) {
        return `\n-- 请添加分区定义`;
      }

      const partitionType = config.type;
      const isRange = config.type.startsWith('RANGE');

      const partitionDefs = config.partitions
        .map((p) => {
          const valueClause = isRange ? `VALUES LESS THAN (${p.value})` : `VALUES IN (${p.value})`;
          return `  PARTITION ${p.name} ${valueClause}`;
        })
        .join(',\n');

      return `\nPARTITION BY ${partitionType}(${partitionKey}) (\n${partitionDefs}\n)`;
    }

    default:
      return '';
  }
};

export const buildDDL = (
  dbType: DatabaseType,
  tableName: string,
  tableComment: string,
  fields: NormalizedField[],
  indexes: IndexDefinition[] = [],
  citusShardingConfig?: CitusShardingConfig,
  mysqlPartitionConfig?: MysqlPartitionConfig,
  tableMiscConfig?: TableMiscConfig,
  sqlFormatMode: SqlFormatMode = 'compact',
  foreignKeys: ForeignKeyDefinition[] = [],
) => {
  if (!tableName.trim()) {
    return '-- 请填写表名';
  }
  if (fields.length === 0) {
    return '-- 请补充字段信息';
  }

  const strategy = DDLStrategyFactory.create(dbType);
  let tableDDL = strategy.generateTableDDL(
    tableName.trim(),
    tableComment,
    fields,
    tableMiscConfig,
    sqlFormatMode,
  );

  const tableOptionsClause = buildTableOptionsClause(dbType, tableMiscConfig);
  if (tableOptionsClause) {
    tableDDL = insertTableOptions(tableDDL, tableOptionsClause);
  }

  // Add MySQL partition clause - insert before the final semicolon
  if (
    (dbType === 'mysql' || dbType === 'mariadb' || dbType === 'tidb') &&
    mysqlPartitionConfig?.enabled
  ) {
    const partitionClause = buildMysqlPartitionClause(mysqlPartitionConfig);
    if (partitionClause) {
      // Replace the final semicolon with partition clause + semicolon
      tableDDL = tableDDL.replace(/;$/, `${partitionClause};`);
    }
  }

  // Build index DDL statements
  const indexDDLs = indexes.map((index) =>
    strategy.generateIndexDDL(tableName.trim(), index, fields),
  );

  // Build foreign key DDL statements
  const fkDDLs = foreignKeys.map((fk) => strategy.generateForeignKeyDDL(tableName.trim(), fk));

  const extraBlocks: string[] = [];
  if (indexDDLs.length > 0) {
    extraBlocks.push(indexDDLs.join('\n'));
  }
  if (fkDDLs.length > 0) {
    extraBlocks.push(fkDDLs.join('\n'));
  }

  if (dbType === 'oracle') {
    const synonymDDL = buildOracleSynonyms(tableName);
    if (synonymDDL) {
      extraBlocks.push(synonymDDL);
    }
  }

  // Add Citus sharding DDL for postgresql-citus
  if (dbType === 'postgresql-citus' && citusShardingConfig) {
    const citusDDL = buildCitusShardingDDL(tableName, citusShardingConfig);
    extraBlocks.push(citusDDL);
  }

  return extraBlocks.length > 0 ? `${tableDDL}\n\n${extraBlocks.join('\n\n')}` : tableDDL;
};

export const buildDCL = (
  dbType: DatabaseType,
  tableName: string,
  authorizationObjects: string[],
) => {
  if (!tableName.trim() || authorizationObjects.length === 0) {
    return '';
  }

  const cleanTableName = tableName.trim();
  const statements: string[] = [];

  switch (dbType) {
    case 'oracle':
      authorizationObjects.forEach((authObject) => {
        statements.push(`GRANT SELECT ON ${cleanTableName} TO ${authObject.trim()};`);
      });
      break;
    default:
      authorizationObjects.forEach((authObject) => {
        statements.push(`GRANT SELECT ON ${cleanTableName} TO ${authObject.trim()};`);
      });
      break;
  }

  return statements.join('\n');
};

export const buildOracleSynonyms = (tableName: string) => {
  const cleanTableName = tableName.trim();
  if (!cleanTableName) return '';

  return `CREATE OR REPLACE PUBLIC SYNONYM ${cleanTableName} FOR ${cleanTableName};`;
};

const insertTableOptions = (ddl: string, clause: string): string => {
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
