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
  if (index.kind === 'primary') {
    return family === 'mysql'
      ? `ALTER TABLE ${tableName} DROP PRIMARY KEY;`
      : `ALTER TABLE ${tableName} DROP CONSTRAINT ${indexName};`;
  }
  if (index.kind === 'unique_constraint' && family !== 'mysql') {
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

  if (index.kind === 'primary' || index.kind === 'unique_constraint') {
    const columns = index.fields.map((field) => formatSqlIdentifier(field.name, dbType)).join(', ');
    const constraint =
      index.kind === 'primary' && family === 'mysql' ? '' : `CONSTRAINT ${indexName} `;
    const kind = index.kind === 'primary' ? 'PRIMARY KEY' : 'UNIQUE';
    return `ALTER TABLE ${tableName} ADD ${constraint}${kind} (${columns});`;
  }

  const fieldList = index.fields
    .map((field) => `${formatSqlIdentifier(field.name, dbType)} ${field.direction}`)
    .join(', ');
  const indexType = index.kind !== 'index' ? 'UNIQUE INDEX' : 'INDEX';
  return `CREATE ${indexType} ${indexName} ON ${tableName} (${fieldList});`;
}
