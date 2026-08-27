import type { DatabaseType } from '@ddlbuilder/shared-types';
import { formatSqlIdentifier } from '../sqlIdentifiers';
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
  const qualifiedIndex = buildQualifiedTableName(
    getSchemaAndTable(tableName).schema,
    index.name,
    dbType,
  );

  // 主键需要特殊处理
  if (index.isPrimary) {
    switch (dbType) {
      case 'mysql':
      case 'mariadb':
      case 'tidb':
      case 'oceanbase':
        return `ALTER TABLE ${tableName} DROP PRIMARY KEY;`;
      case 'postgresql':
      case 'postgresql-citus':
        return `ALTER TABLE ${tableName} DROP CONSTRAINT ${indexName};`;
      case 'sqlserver':
        return `ALTER TABLE ${tableName} DROP CONSTRAINT ${indexName};`;
      case 'oracle':
      case 'oceanbase-oracle':
      case 'dm':
        return `ALTER TABLE ${tableName} DROP CONSTRAINT ${indexName};`;
      default:
        return `ALTER TABLE ${tableName} DROP PRIMARY KEY;`;
    }
  }

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      return `DROP INDEX ${indexName} ON ${tableName};`;
    case 'postgresql':
    case 'postgresql-citus':
      return `DROP INDEX ${qualifiedIndex};`;
    case 'sqlserver':
      return `DROP INDEX ${indexName} ON ${tableName};`;
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `DROP INDEX ${qualifiedIndex};`;
    default:
      return `DROP INDEX ${indexName} ON ${tableName};`;
  }
}

export function generateAddIndex(
  tableName: string,
  idxDiff: IndexDiff,
  dbType: DatabaseType,
): string {
  tableName = formatSqlTableName(tableName, dbType);
  const index = idxDiff.index;
  const indexName = formatSqlIdentifier(index.name, dbType);
  const fieldList = index.fields
    .map((f) => `${formatSqlIdentifier(f.name, dbType)} ${f.direction}`)
    .join(', ');

  // 主键
  if (index.isPrimary) {
    const pkFields = index.fields.map((f) => formatSqlIdentifier(f.name, dbType)).join(', ');
    switch (dbType) {
      case 'mysql':
      case 'mariadb':
      case 'tidb':
      case 'oceanbase':
        return `ALTER TABLE ${tableName} ADD PRIMARY KEY (${pkFields});`;
      case 'postgresql':
      case 'postgresql-citus':
        return `ALTER TABLE ${tableName} ADD CONSTRAINT ${indexName} PRIMARY KEY (${pkFields});`;
      case 'sqlserver':
        return `ALTER TABLE ${tableName} ADD CONSTRAINT ${indexName} PRIMARY KEY (${pkFields});`;
      case 'oracle':
      case 'oceanbase-oracle':
      case 'dm':
        return `ALTER TABLE ${tableName} ADD CONSTRAINT ${indexName} PRIMARY KEY (${pkFields});`;
      default:
        return `ALTER TABLE ${tableName} ADD PRIMARY KEY (${pkFields});`;
    }
  }

  const indexType = index.unique ? 'UNIQUE INDEX' : 'INDEX';
  return `CREATE ${indexType} ${indexName} ON ${tableName} (${fieldList});`;
}
