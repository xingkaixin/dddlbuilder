import type { NormalizedField, DatabaseType } from '@ddlbuilder/shared-types';
import type { FieldDiff } from '../tableDiff';
import { TypeMapper } from '../TypeMapper';
import {
  getCanonicalBaseType,
  supportsAutoIncrement,
  supportsOnUpdateCurrentTimestamp,
  escapeSingleQuotes,
  parseFieldType,
} from '../databaseTypeMapping';
import { buildDefaultClause } from './defaultClause';

export function generateTableCommentAlter(
  tableName: string,
  comment: string,
  dbType: DatabaseType,
): string {
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
  const fieldName = fieldDiff.fieldName;

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
  const oldName = fieldDiff.oldFieldName || '';
  const newName = fieldDiff.newFieldName || '';

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
      return `EXEC sp_rename '${tableName}.${oldName}', '${newName}', 'COLUMN';`;
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
  const columnDef = buildColumnDefinition(field, dbType);

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      return `ALTER TABLE ${tableName} ADD COLUMN ${field.name} ${columnDef};`;
    case 'postgresql':
    case 'postgresql-citus':
      return `ALTER TABLE ${tableName} ADD COLUMN ${field.name} ${columnDef};`;
    case 'sqlserver':
      return `ALTER TABLE ${tableName} ADD ${field.name} ${columnDef};`;
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `ALTER TABLE ${tableName} ADD (${field.name} ${columnDef});`;
    default:
      return `ALTER TABLE ${tableName} ADD COLUMN ${field.name} ${columnDef};`;
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
  const columnDef = buildColumnDefinition(field, dbType);

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      return `ALTER TABLE ${tableName} MODIFY COLUMN ${field.name} ${columnDef};`;
    case 'postgresql':
    case 'postgresql-citus':
      // PostgreSQL 需要分开处理类型、nullable、default
      return generatePostgresModifyColumn(tableName, fieldDiff);
    case 'sqlserver':
      return `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} ${columnDef};`;
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `ALTER TABLE ${tableName} MODIFY (${field.name} ${columnDef});`;
    default:
      return `ALTER TABLE ${tableName} MODIFY COLUMN ${field.name} ${columnDef};`;
  }
}

function generatePostgresModifyColumn(tableName: string, fieldDiff: FieldDiff): string {
  if (!fieldDiff.newField) {
    return '';
  }
  const field = fieldDiff.newField;
  const changes = fieldDiff.changes || [];
  const statements: string[] = [];

  if (changes.includes('type')) {
    const typeMapper = TypeMapper.create('postgresql');
    const parsedType = parseFieldType(field.type);
    const mappedType = typeMapper.mapType(parsedType);
    statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${field.name} TYPE ${mappedType};`);
  }

  if (changes.includes('nullable')) {
    if (field.nullable) {
      statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${field.name} DROP NOT NULL;`);
    } else {
      statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${field.name} SET NOT NULL;`);
    }
  }

  if (changes.includes('default')) {
    const defaultClause = buildDefaultClause(field, 'postgresql');
    if (defaultClause) {
      statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${field.name} SET ${defaultClause};`);
    } else {
      statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${field.name} DROP DEFAULT;`);
    }
  }

  if (changes.includes('comment')) {
    const escapedComment = escapeSingleQuotes(field.comment);
    statements.push(`COMMENT ON COLUMN ${tableName}.${field.name} IS '${escapedComment}';`);
  }

  return statements.join('\n');
}

function buildColumnDefinition(field: NormalizedField, dbType: DatabaseType): string {
  const typeMapper = TypeMapper.create(dbType);
  const parsedType = parseFieldType(field.type);
  const type = typeMapper.mapType(parsedType);
  const base = getCanonicalBaseType(field.type);

  const parts: string[] = [type];

  // 自增（仅特定数据库和类型支持）
  if (field.defaultKind === 'auto_increment' && supportsAutoIncrement(dbType, base)) {
    if (dbType === 'mysql' || dbType === 'mariadb' || dbType === 'tidb') {
      parts.push('AUTO_INCREMENT');
    }
    // PostgreSQL/Oracle 的自增在类型中处理（SERIAL/IDENTITY）
  }

  // NULL/NOT NULL
  parts.push(field.nullable ? 'NULL' : 'NOT NULL');

  // 默认值
  const defaultClause = buildDefaultClause(field, dbType);
  if (defaultClause) {
    parts.push(defaultClause);
  }

  // ON UPDATE（仅 MySQL 系）
  if (field.onUpdate === 'current_timestamp' && supportsOnUpdateCurrentTimestamp(dbType, base)) {
    parts.push('ON UPDATE CURRENT_TIMESTAMP');
  }

  // 注释（仅 MySQL 系内联）
  if (
    field.comment &&
    (dbType === 'mysql' || dbType === 'mariadb' || dbType === 'tidb' || dbType === 'oceanbase')
  ) {
    parts.push(`COMMENT '${escapeSingleQuotes(field.comment)}'`);
  }

  return parts.join(' ');
}
