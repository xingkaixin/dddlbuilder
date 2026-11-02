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
import { formatSqlTableName } from './databaseTypeMapping';
import { formatSqlIdentifier } from './sqlIdentifiers';
import { DDLStrategyFactory } from '../factories/DDLStrategyFactory';
import { resolveFieldComment } from './fieldComment';

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

import { buildSqliteTable } from './sqliteSchema';
import { DDL_NOTICES } from './ddlNotices';

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
    return DDL_NOTICES.tableNameRequired;
  }

  if (fields.length === 0) {
    return DDL_NOTICES.fieldsRequired;
  }

  if (dbType === 'sqlite') {
    try {
      return buildSqliteTable({
        dbType,
        tableName,
        tableComment,
        fields,
        indexes,
        foreignKeys,
        tableMiscConfig,
        mysqlPartitionConfig,
        citusShardingConfig,
      });
    } catch (cause) {
      return `-- SQLite export blocked: ${String(cause instanceof Error ? cause.message : cause).replaceAll(/\r?\n/g, ' ')}`;
    }
  }

  const strategy = DDLStrategyFactory.create(dbType);

  const generatedTableDDL = strategy.generateTableDDL(
    tableName.trim(),
    tableComment,
    fields.map((field) => ({ ...field, comment: resolveFieldComment(field) })),
    tableMiscConfig,
    sqlFormatMode,
    indexes,
  );

  const configuredTable = strategy.applyTableFeatures(tableName.trim(), generatedTableDDL, {
    tableMiscConfig,
    mysqlPartitionConfig,
    citusShardingConfig,
  });

  const fkDDLs = foreignKeys
    .filter((fk) => !fk.logical)
    .map((fk) => strategy.generateForeignKeyDDL(tableName.trim(), fk));

  const extraBlocks: string[] = [];

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
    return DDL_NOTICES.viewNameRequired;
  }

  if (!cleanDefinition) {
    return DDL_NOTICES.viewSqlRequired;
  }

  const strategy = DDLStrategyFactory.create(dbType);

  const keyword =
    dbType === 'sqlite'
      ? 'CREATE VIEW'
      : createOrReplace && dbType === 'sqlserver'
        ? 'CREATE OR ALTER VIEW'
        : createOrReplace
          ? 'CREATE OR REPLACE VIEW'
          : 'CREATE VIEW';

  return `${keyword} ${strategy.formatTableName(cleanViewName)} AS\n${cleanDefinition};`;
};

export const buildDCL = (
  tableName: string,
  authorizationObjects: string[],
  dbType: DatabaseType = 'mysql',
) => {
  if (dbType === 'sqlite') return '-- SQLite / D1 does not support GRANT.';

  if (!tableName.trim() || authorizationObjects.length === 0) {
    return '';
  }

  const cleanTableName = formatSqlTableName(tableName, dbType);

  return authorizationObjects
    .map(
      (authObject) =>
        `GRANT SELECT ON ${cleanTableName} TO ${formatSqlIdentifier(authObject, dbType)};`,
    )
    .join('\n');
};
