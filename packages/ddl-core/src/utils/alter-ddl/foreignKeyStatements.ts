import type { DatabaseType } from '@ddlbuilder/shared-types';
import { formatSqlIdentifier } from '../sqlIdentifiers';
import { buildQualifiedTableName, formatSqlTableName } from '../databaseTypeMapping';
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
  tableName = formatSqlTableName(tableName, dbType);
  const fk = fkDiff.foreignKey;
  const constraintName = formatSqlIdentifier(fk.name, dbType);
  const fieldList = fk.fields.map((name) => formatSqlIdentifier(name, dbType)).join(', ');
  const refFieldList = fk.refFields.map((name) => formatSqlIdentifier(name, dbType)).join(', ');

  const refTable = buildQualifiedTableName(fk.refSchema ?? '', fk.refTable, dbType);

  let sql = `ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${fieldList}) REFERENCES ${refTable} (${refFieldList})`;

  if (fk.onDelete) {
    sql += ` ON DELETE ${fk.onDelete}`;
  }
  if (fk.onUpdate) {
    sql += ` ON UPDATE ${fk.onUpdate}`;
  }

  sql += ';';
  return sql;
}
