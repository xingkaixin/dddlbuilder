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
  tableName = formatSqlTableName(tableName, dbType);
  const fk = fkDiff.foreignKey;
  const constraintName = formatSqlIdentifier(fk.name, dbType);

  // 只有 MySQL 系用 DROP FOREIGN KEY 语法，其余方言（含派生系）统一 DROP CONSTRAINT
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
