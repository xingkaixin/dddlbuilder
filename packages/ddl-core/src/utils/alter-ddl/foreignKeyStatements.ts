import type { DatabaseType } from '@ddlbuilder/shared-types';
import type { ForeignKeyDiff } from '../tableDiff';

export function generateDropForeignKey(
  tableName: string,
  fkDiff: ForeignKeyDiff,
  dbType: DatabaseType,
): string {
  const fk = fkDiff.foreignKey;

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      return `ALTER TABLE ${tableName} DROP FOREIGN KEY ${fk.name};`;
    case 'postgresql':
    case 'postgresql-citus':
    case 'sqlserver':
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `ALTER TABLE ${tableName} DROP CONSTRAINT ${fk.name};`;
    case 'kingbase':
    case 'gaussdb':
      return `ALTER TABLE ${tableName} DROP CONSTRAINT ${fk.name};`;
    case 'gbase':
    case 'polardb':
      return `ALTER TABLE ${tableName} DROP FOREIGN KEY ${fk.name};`;
    default:
      return `ALTER TABLE ${tableName} DROP CONSTRAINT ${fk.name};`;
  }
}

export function generateAddForeignKey(
  tableName: string,
  fkDiff: ForeignKeyDiff,
  _dbType: DatabaseType,
): string {
  const fk = fkDiff.foreignKey;
  const fieldList = fk.fields.join(', ');
  const refFieldList = fk.refFields.join(', ');

  const refTableParts: string[] = [];
  if (fk.refSchema) {
    refTableParts.push(fk.refSchema);
  }
  refTableParts.push(fk.refTable);
  const refTable = refTableParts.join('.');

  let sql = `ALTER TABLE ${tableName} ADD CONSTRAINT ${fk.name} FOREIGN KEY (${fieldList}) REFERENCES ${refTable} (${refFieldList})`;

  if (fk.onDelete) {
    sql += ` ON DELETE ${fk.onDelete}`;
  }
  if (fk.onUpdate) {
    sql += ` ON UPDATE ${fk.onUpdate}`;
  }

  sql += ';';
  return sql;
}
