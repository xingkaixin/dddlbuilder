import type { DatabaseType } from '@ddlbuilder/shared-types';
import { escapeSingleQuotes } from '../databaseTypeMapping';

export function generateRenameTable(
  oldTableName: string,
  newTableName: string,
  dbType: DatabaseType,
): string {
  if (!oldTableName || !newTableName || oldTableName === newTableName) return '';
  if (dbType === 'sqlserver') {
    return `EXEC sp_rename '${escapeSingleQuotes(oldTableName)}', '${escapeSingleQuotes(newTableName)}';`;
  }
  return `ALTER TABLE ${oldTableName} RENAME TO ${newTableName};`;
}

export function generateTableOptionsChangeNotice(tableName: string, dbType: DatabaseType): string {
  return `-- Manual migration required: table options changed for ${tableName} (${dbType}).`;
}
