import type { DatabaseType } from '@ddlbuilder/shared-types';
import { getDatabaseFamily } from '../databaseFamily';
import { formatSqlIdentifier } from '../sqlIdentifiers';
import { formatSqlTableName } from '../databaseTypeMapping';
import { buildForeignKeyDDL } from '../foreignKeys';
import type { ForeignKeyDiff } from '../tableDiff';

export function generateDropForeignKey(
  tableName: string,
  fkDiff: ForeignKeyDiff,
  dbType: DatabaseType,
): string {
  if (fkDiff.foreignKey.logical) return '';
  tableName = formatSqlTableName(tableName, dbType);
  const fk = fkDiff.foreignKey;
  const constraintName = formatSqlIdentifier(fk.name, dbType);

  if (dbType === 'hive') {
    return `-- Manual migration required: drop foreign key ${constraintName} on ${tableName} (${dbType}).`;
  }

  if (getDatabaseFamily(dbType) === 'mysql') {
    return `ALTER TABLE ${tableName} DROP FOREIGN KEY ${constraintName};`;
  }

  return `ALTER TABLE ${tableName} DROP CONSTRAINT ${constraintName};`;
}

export function generateAddForeignKey(
  tableName: string,
  fkDiff: ForeignKeyDiff,
  dbType: DatabaseType,
): string {
  return buildForeignKeyDDL(tableName, fkDiff.foreignKey, dbType);
}
