import type { DatabaseType } from '@ddlbuilder/shared-types';
import { formatSqlIdentifier } from '../sqlIdentifiers';
import { getDatabaseFamily } from '../databaseFamily';
import type { IndexDiff } from '../tableDiff';
import {
  buildQualifiedTableName,
  getSchemaAndTable,
  formatSqlTableName,
} from '../databaseTypeMapping';

export function generateDropIndex(
  tableName: string,
  idxDiff: IndexDiff,
  dbType: DatabaseType,
): string {
  tableName = formatSqlTableName(tableName, dbType);
  const index = idxDiff.index;
  const indexName = formatSqlIdentifier(index.name, dbType);
  const family = getDatabaseFamily(dbType);
  if (!family || family === 'hive') {
    return `-- Manual migration required: drop index ${indexName} on ${tableName} (${dbType}).`;
  }
  const qualifiedIndex = buildQualifiedTableName(
    getSchemaAndTable(tableName).schema,
    index.name,
    dbType,
  );
  if (index.isPrimary) {
    return family === 'mysql'
      ? `ALTER TABLE ${tableName} DROP PRIMARY KEY;`
      : `ALTER TABLE ${tableName} DROP CONSTRAINT ${indexName};`;
  }
  if (index.isUniqueConstraint && family !== 'mysql') {
    return `ALTER TABLE ${tableName} DROP CONSTRAINT ${indexName};`;
  }
  return family === 'mysql' || family === 'sqlserver'
    ? `DROP INDEX ${indexName} ON ${tableName};`
    : `DROP INDEX ${qualifiedIndex};`;
}

export function generateAddIndex(
  tableName: string,
  idxDiff: IndexDiff,
  dbType: DatabaseType,
): string {
  tableName = formatSqlTableName(tableName, dbType);
  const index = idxDiff.index;
  const indexName = formatSqlIdentifier(index.name, dbType);
  const family = getDatabaseFamily(dbType);
  if (!family || family === 'hive') {
    return `-- Manual migration required: add index ${indexName} on ${tableName} (${dbType}).`;
  }

  if (index.isPrimary || index.isUniqueConstraint) {
    const columns = index.fields.map((field) => formatSqlIdentifier(field.name, dbType)).join(', ');
    const constraint = index.isPrimary && family === 'mysql' ? '' : `CONSTRAINT ${indexName} `;
    const kind = index.isPrimary ? 'PRIMARY KEY' : 'UNIQUE';
    return `ALTER TABLE ${tableName} ADD ${constraint}${kind} (${columns});`;
  }

  const fieldList = index.fields
    .map((field) => `${formatSqlIdentifier(field.name, dbType)} ${field.direction}`)
    .join(', ');
  const indexType = index.unique ? 'UNIQUE INDEX' : 'INDEX';
  return `CREATE ${indexType} ${indexName} ON ${tableName} (${fieldList});`;
}
