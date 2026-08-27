import type { DatabaseType } from '@ddlbuilder/shared-types';
import {
  buildQualifiedTableName,
  escapeSingleQuotes,
  getSchemaAndTable,
  formatSqlTableName,
} from '../databaseTypeMapping';

import { formatSqlIdentifier, unquoteSqlIdentifier } from '../sqlIdentifiers';

export function generateTableSchemaChange(
  tableName: string,
  newSchema: string,
  dbType: DatabaseType,
): string | null {
  if (!newSchema) return null;
  tableName = formatSqlTableName(tableName, dbType);
  newSchema = formatSqlIdentifier(newSchema, dbType);
  if (dbType === 'postgresql') return `ALTER TABLE ${tableName} SET SCHEMA ${newSchema};`;
  if (dbType === 'sqlserver') return `ALTER SCHEMA ${newSchema} TRANSFER ${tableName};`;
  if (dbType === 'mysql') {
    return `RENAME TABLE ${tableName} TO ${buildQualifiedTableName(newSchema, getSchemaAndTable(tableName).table, dbType)};`;
  }
  return null;
}

export function generateRenameTable(
  oldTableName: string,
  newTableName: string,
  dbType: DatabaseType,
): string {
  if (!oldTableName || !newTableName || oldTableName === newTableName) return '';
  if (dbType === 'sqlserver') {
    const newName = unquoteSqlIdentifier(getSchemaAndTable(newTableName).table);
    return `EXEC sp_rename '${escapeSingleQuotes(oldTableName)}', '${escapeSingleQuotes(newName)}';`;
  }
  oldTableName = formatSqlTableName(oldTableName, dbType);
  newTableName = formatSqlTableName(newTableName, dbType);
  if (['mysql', 'mariadb', 'tidb', 'oceanbase'].includes(dbType)) {
    return `ALTER TABLE ${oldTableName} RENAME TO ${newTableName};`;
  }
  const newName = getSchemaAndTable(newTableName).table;
  return `ALTER TABLE ${oldTableName} RENAME TO ${newName};`;
}

export function generateTableOptionsChangeNotice(tableName: string, dbType: DatabaseType): string {
  return `-- Manual migration required: table options changed for ${tableName} (${dbType}).`;
}
