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

export { buildOracleSynonyms } from './tableFeatures';

export interface BuildDDLInput {
  dbType: DatabaseType;
  tableName: string;
  tableComment: string;
  fields: NormalizedField[];
  indexes?: IndexDefinition[];
  citusShardingConfig?: CitusShardingConfig;
  mysqlPartitionConfig?: MysqlPartitionConfig;
  tableMiscConfig?: TableMiscConfig;
  sqlFormatMode?: SqlFormatMode;
  foreignKeys?: ForeignKeyDefinition[];
}

export const buildDDL = ({
  dbType,
  tableName,
  tableComment,
  fields,
  indexes = [],
  citusShardingConfig,
  mysqlPartitionConfig,
  tableMiscConfig,
  sqlFormatMode = 'compact',
  foreignKeys = [],
}: BuildDDLInput) => {
  if (!tableName.trim()) {
    return '-- 请填写表名';
  }
  if (fields.length === 0) {
    return '-- 请补充字段信息';
  }

  const strategy = DDLStrategyFactory.create(dbType);
  const generatedTableDDL = strategy.generateTableDDL(
    tableName.trim(),
    tableComment,
    fields,
    tableMiscConfig,
    sqlFormatMode,
  );

  const configuredTable = strategy.applyTableFeatures(tableName.trim(), generatedTableDDL, {
    tableMiscConfig,
    mysqlPartitionConfig,
    citusShardingConfig,
  });

  const indexDDLs = indexes.map((index) => strategy.generateIndexDDL(tableName.trim(), index));

  const fkDDLs = foreignKeys.map((fk) => strategy.generateForeignKeyDDL(tableName.trim(), fk));

  const extraBlocks: string[] = [];
  if (indexDDLs.length > 0) {
    extraBlocks.push(indexDDLs.join('\n'));
  }
  if (fkDDLs.length > 0) {
    extraBlocks.push(fkDDLs.join('\n'));
  }

  extraBlocks.push(...configuredTable.trailingStatements.filter(Boolean));

  return extraBlocks.length > 0
    ? `${configuredTable.tableDDL}\n\n${extraBlocks.join('\n\n')}`
    : configuredTable.tableDDL;
};

export const buildViewDDL = (
  dbType: DatabaseType,
  viewName: string,
  definition: string,
  createOrReplace = true,
) => {
  const cleanViewName = viewName.trim();
  const cleanDefinition = definition.trim().replace(/;+\s*$/, '');

  if (!cleanViewName) {
    return '-- 请填写视图名';
  }
  if (!cleanDefinition) {
    return '-- 请填写视图 SQL';
  }

  const strategy = DDLStrategyFactory.create(dbType);
  const keyword =
    createOrReplace && dbType === 'sqlserver'
      ? 'CREATE OR ALTER VIEW'
      : createOrReplace
        ? 'CREATE OR REPLACE VIEW'
        : 'CREATE VIEW';

  return `${keyword} ${strategy.formatTableName(cleanViewName)} AS\n${cleanDefinition};`;
};

export const buildDCL = (tableName: string, authorizationObjects: string[]) => {
  if (!tableName.trim() || authorizationObjects.length === 0) {
    return '';
  }

  const cleanTableName = tableName.trim();
  return authorizationObjects
    .map((authObject) => `GRANT SELECT ON ${cleanTableName} TO ${authObject.trim()};`)
    .join('\n');
};
