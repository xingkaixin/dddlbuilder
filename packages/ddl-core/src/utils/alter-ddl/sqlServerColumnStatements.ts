import type { FieldDiff } from '../tableDiff';
import { escapeSingleQuotes, getFieldTypeForDatabase } from '../databaseTypeMapping';
import { formatSqlIdentifier, unquoteSqlIdentifier } from '../sqlIdentifiers';
import { buildDialectDefaultClause } from '../../strategies/dialectColumn';
import { buildColumnComment } from '../../strategies/dialectComments';

export function getSqlServerColumnChangeNotice(diff: FieldDiff): string {
  if (
    diff.oldField &&
    diff.newField &&
    (diff.oldField.defaultKind === 'auto_increment') !==
      (diff.newField.defaultKind === 'auto_increment')
  ) {
    return '-- Manual migration required: SQL Server cannot add or remove IDENTITY on an existing column. No automatic changes generated.';
  }
  return '';
}

export function generateSqlServerDropDefault(tableName: string, fieldName: string): string {
  const tableLiteral = escapeSingleQuotes(tableName);
  const fieldLiteral = escapeSingleQuotes(unquoteSqlIdentifier(fieldName));
  const batch = [
    'DECLARE @ddlbuilderDefaultSql nvarchar(max);',
    `SELECT @ddlbuilderDefaultSql = N'ALTER TABLE ${tableLiteral} DROP CONSTRAINT ' + QUOTENAME(d.name) + N';'`,
    'FROM sys.default_constraints AS d',
    'INNER JOIN sys.columns AS c ON d.parent_object_id = c.object_id AND d.parent_column_id = c.column_id',
    `WHERE d.parent_object_id = OBJECT_ID(N'${tableLiteral}') AND c.name = N'${fieldLiteral}';`,
    'IF @ddlbuilderDefaultSql IS NOT NULL EXEC sys.sp_executesql @ddlbuilderDefaultSql;',
  ].join('\n');
  // 独立批次避免同一迁移里多列默认约束操作重复声明变量。
  return `EXEC sys.sp_executesql N'${escapeSingleQuotes(batch)}';`;
}

export function generateSqlServerModifyColumn(tableName: string, diff: FieldDiff): string {
  const field = diff.newField;
  if (!field) return '';
  const notice = getSqlServerColumnChangeNotice(diff);
  if (notice) return notice;
  const fieldName = formatSqlIdentifier(field.name, 'sqlserver');
  const type = getFieldTypeForDatabase('sqlserver', field.type);
  const oldType = diff.oldField && getFieldTypeForDatabase('sqlserver', diff.oldField.type);
  const typeChanged = type !== oldType;
  const oldDefault = diff.oldField ? buildDialectDefaultClause(diff.oldField, 'sqlserver') : '';
  const newDefault = buildDialectDefaultClause(field, 'sqlserver');
  const replaceDefault = oldDefault !== newDefault || (typeChanged && !!(oldDefault || newDefault));
  const statements: string[] = [];
  if (replaceDefault && oldDefault)
    statements.push(generateSqlServerDropDefault(tableName, field.name));
  if (typeChanged || field.nullable !== diff.oldField?.nullable) {
    statements.push(
      `ALTER TABLE ${tableName} ALTER COLUMN ${fieldName} ${type} ${field.nullable ? 'NULL' : 'NOT NULL'};`,
    );
  }
  if (replaceDefault && newDefault)
    statements.push(`ALTER TABLE ${tableName} ADD ${newDefault} FOR ${fieldName};`);
  if (diff.changes?.includes('comment')) {
    statements.push(buildColumnComment(tableName, field, 'sqlserver', diff.oldField?.comment));
  }
  return statements.filter(Boolean).join('\n');
}
