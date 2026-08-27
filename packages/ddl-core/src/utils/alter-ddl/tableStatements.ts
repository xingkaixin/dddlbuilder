import type { DatabaseType } from '@ddlbuilder/shared-types';
import {
  buildQualifiedTableName,
  escapeSingleQuotes,
  getSchemaAndTable,
} from '../databaseTypeMapping';

export function generateTableSchemaChange(
  tableName: string,
  newSchema: string,
  dbType: DatabaseType,
): string | null {
  if (!newSchema) return null;
  if (dbType === 'postgresql') return `ALTER TABLE ${tableName} SET SCHEMA ${newSchema};`;
  if (dbType === 'sqlserver') return `ALTER SCHEMA ${newSchema} TRANSFER ${tableName};`;
  if (dbType === 'mysql') {
    return `RENAME TABLE ${tableName} TO ${buildQualifiedTableName(newSchema, getSchemaAndTable(tableName).table)};`;
  }
  return null;
}

export function generateRenameTable(
  oldTableName: string,
  newTableName: string,
  dbType: DatabaseType,
): string {
  if (!oldTableName || !newTableName || oldTableName === newTableName) return '';
  if (['mysql', 'mariadb', 'tidb', 'oceanbase'].includes(dbType)) {
    return `ALTER TABLE ${oldTableName} RENAME TO ${newTableName};`;
  }
  const newName = getSchemaAndTable(newTableName).table;
  if (dbType === 'sqlserver') {
    return `EXEC sp_rename '${escapeSingleQuotes(oldTableName)}', '${escapeSingleQuotes(newName)}';`;
  }
  return `ALTER TABLE ${oldTableName} RENAME TO ${newName};`;
}

export function generateTableOptionsChangeNotice(tableName: string, dbType: DatabaseType): string {
  return `-- Manual migration required: table options changed for ${tableName} (${dbType}).`;
}
