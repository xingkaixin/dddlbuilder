import type { DatabaseType } from '@ddlbuilder/shared-types';
import { escapeSingleQuotes, getSchemaAndTable } from '../databaseTypeMapping';

export function generateRenameTable(
  oldTableName: string,
  newTableName: string,
  dbType: DatabaseType,
): string {
  if (!oldTableName || !newTableName || oldTableName === newTableName) return '';
  const newName = getSchemaAndTable(newTableName).table;
  if (dbType === 'sqlserver') {
    return `EXEC sp_rename '${escapeSingleQuotes(oldTableName)}', '${escapeSingleQuotes(newName)}';`;
  }
  return `ALTER TABLE ${oldTableName} RENAME TO ${newName};`;
}

export function generateTableOptionsChangeNotice(tableName: string, dbType: DatabaseType): string {
  return `-- Manual migration required: table options changed for ${tableName} (${dbType}).`;
}
