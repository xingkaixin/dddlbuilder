import type { DatabaseType } from '@/types';
import type { IndexDiff } from '../tableDiff';

export function generateDropIndex(
  tableName: string,
  idxDiff: IndexDiff,
  dbType: DatabaseType,
): string {
  const index = idxDiff.index;

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
        return `ALTER TABLE ${tableName} DROP CONSTRAINT ${index.name};`;
      case 'sqlserver':
        return `ALTER TABLE ${tableName} DROP CONSTRAINT ${index.name};`;
      case 'oracle':
      case 'oceanbase-oracle':
      case 'dm':
        return `ALTER TABLE ${tableName} DROP CONSTRAINT ${index.name};`;
      default:
        return `ALTER TABLE ${tableName} DROP PRIMARY KEY;`;
    }
  }

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      return `DROP INDEX ${index.name} ON ${tableName};`;
    case 'postgresql':
    case 'postgresql-citus':
      return `DROP INDEX ${index.name};`;
    case 'sqlserver':
      return `DROP INDEX ${index.name} ON ${tableName};`;
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `DROP INDEX ${index.name};`;
    default:
      return `DROP INDEX ${index.name} ON ${tableName};`;
  }
}

export function generateAddIndex(
  tableName: string,
  idxDiff: IndexDiff,
  dbType: DatabaseType,
): string {
  const index = idxDiff.index;
  const fieldList = index.fields
    .map((f) => `${f.name} ${f.direction}`)
    .join(', ');

  // 主键
  if (index.isPrimary) {
    const pkFields = index.fields.map((f) => f.name).join(', ');
    switch (dbType) {
      case 'mysql':
      case 'mariadb':
      case 'tidb':
      case 'oceanbase':
        return `ALTER TABLE ${tableName} ADD PRIMARY KEY (${pkFields});`;
      case 'postgresql':
      case 'postgresql-citus':
        return `ALTER TABLE ${tableName} ADD CONSTRAINT ${index.name} PRIMARY KEY (${pkFields});`;
      case 'sqlserver':
        return `ALTER TABLE ${tableName} ADD CONSTRAINT ${index.name} PRIMARY KEY (${pkFields});`;
      case 'oracle':
      case 'oceanbase-oracle':
      case 'dm':
        return `ALTER TABLE ${tableName} ADD CONSTRAINT ${index.name} PRIMARY KEY (${pkFields});`;
      default:
        return `ALTER TABLE ${tableName} ADD PRIMARY KEY (${pkFields});`;
    }
  }

  const indexType = index.unique ? 'UNIQUE INDEX' : 'INDEX';
  return `CREATE ${indexType} ${index.name} ON ${tableName} (${fieldList});`;
}
