import type { DatabaseType } from '@ddlbuilder/shared-types';
import { formatSqlIdentifier } from '../sqlIdentifiers';
import { formatSqlTableName } from '../databaseTypeMapping';
import { buildForeignKeyDDL } from '../foreignKeys';
import type { ForeignKeyDiff } from '../tableDiff';

export function generateDropForeignKey(
  tableName: string,
  fkDiff: ForeignKeyDiff,
  dbType: DatabaseType,
): string {
  tableName = formatSqlTableName(tableName, dbType);
  const fk = fkDiff.foreignKey;
  const constraintName = formatSqlIdentifier(fk.name, dbType);

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      return `ALTER TABLE ${tableName} DROP FOREIGN KEY ${constraintName};`;
    case 'postgresql':
    case 'postgresql-citus':
    case 'sqlserver':
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `ALTER TABLE ${tableName} DROP CONSTRAINT ${constraintName};`;
    case 'kingbase':
    case 'gaussdb':
      return `ALTER TABLE ${tableName} DROP CONSTRAINT ${constraintName};`;
    case 'gbase':
    case 'polardb':
      return `ALTER TABLE ${tableName} DROP FOREIGN KEY ${constraintName};`;
    default:
      return `ALTER TABLE ${tableName} DROP CONSTRAINT ${constraintName};`;
  }
}

export function generateAddForeignKey(
  tableName: string,
  fkDiff: ForeignKeyDiff,
  dbType: DatabaseType,
): string {
  return buildForeignKeyDDL(tableName, fkDiff.foreignKey, dbType);
}
