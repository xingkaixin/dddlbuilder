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
import { buildColumnComment } from '../../strategies/dialectComments';
import { getDatabaseFamily } from '../databaseFamily';
import {
  generateSqlServerDropDefault,
  generateSqlServerModifyColumn,
} from './sqlServerColumnStatements';

export function generateTableCommentAlter(
  tableName: string,
  comment: string,
  dbType: DatabaseType,
): string {
  tableName = formatSqlTableName(tableName, dbType);
  const escapedComment = escapeSingleQuotes(comment);

  switch (getDatabaseFamily(dbType)) {
    case 'mysql':
      return `ALTER TABLE ${tableName} COMMENT = '${escapedComment}';`;
    case 'postgresql':
    case 'oracle':
    case 'dm':
      return `COMMENT ON TABLE ${tableName} IS '${escapedComment}';`;
    case 'sqlserver':
      // SQL Server 使用扩展属性，较复杂，暂返回注释提示
      return `-- 请使用 sp_updateextendedproperty 更新表注释`;
    default:
      return `-- Manual migration required: update table comment for ${tableName} (${dbType}).`;
  }
}

export function generateDropColumn(
  tableName: string,
  fieldDiff: FieldDiff,
  dbType: DatabaseType,
): string {
  tableName = formatSqlTableName(tableName, dbType);
  const fieldName = formatSqlIdentifier(fieldDiff.fieldName, dbType);

  const defaultSql =
    dbType === 'sqlserver' && fieldDiff.oldField && buildDefaultClause(fieldDiff.oldField, dbType)
      ? generateSqlServerDropDefault(tableName, fieldDiff.fieldName)
      : '';
  return [defaultSql, `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};`]
    .filter(Boolean)
    .join('\n');
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
  const family = getDatabaseFamily(dbType);
  const column = `${fieldName} ${columnDef}`;
  const clause =
    family === 'oracle' || dbType === 'dm'
      ? `ADD (${column})`
      : dbType === 'sqlserver'
        ? `ADD ${column}`
        : `ADD COLUMN ${column}`;
  return [
    `ALTER TABLE ${tableName} ${clause};`,
    field.comment ? buildColumnComment(tableName, field, dbType) : '',
  ]
    .filter(Boolean)
    .join('\n');
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
  if (dbType === 'sqlserver') return generateSqlServerModifyColumn(tableName, fieldDiff);
  const fieldName = formatSqlIdentifier(field.name, dbType);
  const columnDef = buildColumnDefinition(field, dbType);
  const family = getDatabaseFamily(dbType);
  if (family === 'postgresql') return generatePostgresModifyColumn(tableName, fieldDiff);
  const comment = fieldDiff.changes?.includes('comment')
    ? buildColumnComment(tableName, field, dbType, fieldDiff.oldField?.comment)
    : '';
  if (comment && fieldDiff.changes?.every((change) => change === 'comment')) return comment;
  const column = `${fieldName} ${columnDef}`;
  const clause =
    family === 'oracle' || dbType === 'dm' ? `MODIFY (${column})` : `MODIFY COLUMN ${column}`;
  return [`ALTER TABLE ${tableName} ${clause};`, comment].filter(Boolean).join('\n');
}

function generatePostgresModifyColumn(tableName: string, fieldDiff: FieldDiff): string {
  if (!fieldDiff.newField) {
    return '';
  }
  const field = fieldDiff.newField;
  const fieldName = formatSqlIdentifier(field.name, 'postgresql');
  const alterColumn = `ALTER TABLE ${tableName} ALTER COLUMN ${fieldName}`;
  const changes = fieldDiff.changes || [];
  const statements: string[] = [];
  const wasIdentity = fieldDiff.oldField?.defaultKind === 'auto_increment';
  const isIdentity = field.defaultKind === 'auto_increment';
  const addingIdentity = isIdentity && !wasIdentity;

  if (wasIdentity && !isIdentity) {
    statements.push(`${alterColumn} DROP IDENTITY;`);
  }
  if (addingIdentity) {
    statements.push(`${alterColumn} DROP DEFAULT;`);
  }

  if (changes.includes('type')) {
    const mappedType = getFieldTypeForDatabase('postgresql', field.type);
    statements.push(`${alterColumn} TYPE ${mappedType};`);
  }

  if (changes.includes('nullable') || addingIdentity) {
    const action = field.nullable && !addingIdentity ? 'DROP' : 'SET';
    statements.push(`${alterColumn} ${action} NOT NULL;`);
  }

  if (changes.includes('default') && !isIdentity) {
    const defaultClause = buildDefaultClause(field, 'postgresql');
    if (defaultClause) {
      statements.push(`${alterColumn} SET ${defaultClause};`);
    } else if (!wasIdentity) {
      statements.push(`${alterColumn} DROP DEFAULT;`);
    }
  }

  if (changes.includes('comment')) {
    statements.push(buildColumnComment(tableName, field, 'postgresql'));
  }

  if (addingIdentity) {
    const tableLiteral = escapeSingleQuotes(tableName);
    const columnLiteral = escapeSingleQuotes(unquoteSqlIdentifier(fieldName));
    statements.push(`${alterColumn} ADD GENERATED BY DEFAULT AS IDENTITY;`);
    statements.push(
      `PERFORM setval(pg_get_serial_sequence('${tableLiteral}', '${columnLiteral}'), GREATEST(COALESCE(MAX(${fieldName}), 1), 1), COALESCE(MAX(${fieldName}), 0) >= 1) FROM ${tableName};`,
    );
    // 新建序列和定位起点必须共用 ALTER TABLE 的锁，防止并发插入复用已有值。
    return `DO '${escapeSingleQuotes(`BEGIN\n${statements.join('\n')}\nEND`)}';`;
  }

  return statements.join('\n');
}

export function buildColumnDefinition(field: NormalizedField, dbType: DatabaseType): string {
  const column = buildDialectColumn(field, dbType);
  return column.comment ? `${column.body} ${column.comment}` : column.body;
}
