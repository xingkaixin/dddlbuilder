import type { NormalizedField, DatabaseType } from '@ddlbuilder/shared-types';
import type { FieldDiff } from '../tableDiff';
import {
  escapeSingleQuotes,
  getFieldTypeForDatabase,
  formatSqlTableName,
} from '../databaseTypeMapping';
import { buildDialectColumn } from '../../strategies/dialectColumn';
import { formatSqlIdentifier, unquoteSqlIdentifier } from '../sqlIdentifiers';
import { buildDefaultClause } from './defaultClause';

export function generateTableCommentAlter(
  tableName: string,
  comment: string,
  dbType: DatabaseType,
): string {
  tableName = formatSqlTableName(tableName, dbType);
  const escapedComment = escapeSingleQuotes(comment);

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
      return `ALTER TABLE ${tableName} COMMENT = '${escapedComment}';`;
    case 'postgresql':
    case 'postgresql-citus':
      return `COMMENT ON TABLE ${tableName} IS '${escapedComment}';`;
    case 'sqlserver':
      // SQL Server 使用扩展属性，较复杂，暂返回注释提示
      return `-- 请使用 sp_updateextendedproperty 更新表注释`;
    case 'oracle':
    case 'oceanbase-oracle':
      return `COMMENT ON TABLE ${tableName} IS '${escapedComment}';`;
    case 'dm':
      return `COMMENT ON TABLE ${tableName} IS '${escapedComment}';`;
    default:
      return '';
  }
}

export function generateDropColumn(
  tableName: string,
  fieldDiff: FieldDiff,
  dbType: DatabaseType,
): string {
  tableName = formatSqlTableName(tableName, dbType);
  const fieldName = formatSqlIdentifier(fieldDiff.fieldName, dbType);

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      return `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};`;
    case 'postgresql':
    case 'postgresql-citus':
      return `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};`;
    case 'sqlserver':
      return `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};`;
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};`;
    default:
      return `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};`;
  }
}

export function generateRenameColumn(
  tableName: string,
  fieldDiff: FieldDiff,
  dbType: DatabaseType,
): string {
  tableName = formatSqlTableName(tableName, dbType);
  const oldName = formatSqlIdentifier(fieldDiff.oldFieldName || '', dbType);
  const newName = formatSqlIdentifier(fieldDiff.newFieldName || '', dbType);

  if (!oldName || !newName) {
    return '';
  }

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      // MySQL 8.0+ 支持 RENAME COLUMN，旧版本需要 CHANGE COLUMN
      return `ALTER TABLE ${tableName} RENAME COLUMN ${oldName} TO ${newName};`;
    case 'postgresql':
    case 'postgresql-citus':
      return `ALTER TABLE ${tableName} RENAME COLUMN ${oldName} TO ${newName};`;
    case 'sqlserver':
      return `EXEC sp_rename '${escapeSingleQuotes(`${tableName}.${oldName}`)}', '${escapeSingleQuotes(unquoteSqlIdentifier(newName))}', 'COLUMN';`;
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `ALTER TABLE ${tableName} RENAME COLUMN ${oldName} TO ${newName};`;
    default:
      return `ALTER TABLE ${tableName} RENAME COLUMN ${oldName} TO ${newName};`;
  }
}

export function generateAddColumn(
  tableName: string,
  fieldDiff: FieldDiff,
  dbType: DatabaseType,
): string {
  if (!fieldDiff.newField) {
    return '';
  }
  const field = fieldDiff.newField;
  tableName = formatSqlTableName(tableName, dbType);
  const fieldName = formatSqlIdentifier(field.name, dbType);
  const columnDef = buildColumnDefinition(field, dbType);

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      return `ALTER TABLE ${tableName} ADD COLUMN ${fieldName} ${columnDef};`;
    case 'postgresql':
    case 'postgresql-citus':
      return `ALTER TABLE ${tableName} ADD COLUMN ${fieldName} ${columnDef};`;
    case 'sqlserver':
      return `ALTER TABLE ${tableName} ADD ${fieldName} ${columnDef};`;
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `ALTER TABLE ${tableName} ADD (${fieldName} ${columnDef});`;
    default:
      return `ALTER TABLE ${tableName} ADD COLUMN ${fieldName} ${columnDef};`;
  }
}

export function generateModifyColumn(
  tableName: string,
  fieldDiff: FieldDiff,
  dbType: DatabaseType,
): string {
  if (!fieldDiff.newField) {
    return '';
  }
  const field = fieldDiff.newField;
  tableName = formatSqlTableName(tableName, dbType);
  const fieldName = formatSqlIdentifier(field.name, dbType);
  const columnDef = buildColumnDefinition(field, dbType);

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      return `ALTER TABLE ${tableName} MODIFY COLUMN ${fieldName} ${columnDef};`;
    case 'postgresql':
    case 'postgresql-citus':
      // PostgreSQL 需要分开处理类型、nullable、default
      return generatePostgresModifyColumn(tableName, fieldDiff);
    case 'sqlserver':
      return `ALTER TABLE ${tableName} ALTER COLUMN ${fieldName} ${columnDef};`;
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `ALTER TABLE ${tableName} MODIFY (${fieldName} ${columnDef});`;
    default:
      return `ALTER TABLE ${tableName} MODIFY COLUMN ${fieldName} ${columnDef};`;
  }
}

function generatePostgresModifyColumn(tableName: string, fieldDiff: FieldDiff): string {
  if (!fieldDiff.newField) {
    return '';
  }
  const field = fieldDiff.newField;
  const fieldName = formatSqlIdentifier(field.name, 'postgresql');
  const changes = fieldDiff.changes || [];
  const statements: string[] = [];

  if (changes.includes('type')) {
    const mappedType = getFieldTypeForDatabase('postgresql', field.type);
    statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${fieldName} TYPE ${mappedType};`);
  }

  if (changes.includes('nullable')) {
    if (field.nullable) {
      statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${fieldName} DROP NOT NULL;`);
    } else {
      statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${fieldName} SET NOT NULL;`);
    }
  }

  if (changes.includes('default')) {
    const defaultClause = buildDefaultClause(field, 'postgresql');
    if (defaultClause) {
      statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${fieldName} SET ${defaultClause};`);
    } else {
      statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${fieldName} DROP DEFAULT;`);
    }
  }

  if (changes.includes('comment')) {
    const escapedComment = escapeSingleQuotes(field.comment);
    statements.push(`COMMENT ON COLUMN ${tableName}.${fieldName} IS '${escapedComment}';`);
  }

  return statements.join('\n');
}

function buildColumnDefinition(field: NormalizedField, dbType: DatabaseType): string {
  const column = buildDialectColumn(field, dbType);
  return column.comment ? `${column.body} ${column.comment}` : column.body;
}
