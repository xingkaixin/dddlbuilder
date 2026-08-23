import type { NormalizedField, DatabaseType } from '@ddlbuilder/shared-types';
import type { TableDiff } from '../tableDiff';
import {
  generateTableCommentAlter,
  generateDropColumn,
  generateRenameColumn,
  generateAddColumn,
  generateModifyColumn,
} from './columnStatements';
import { generateDropIndex, generateAddIndex } from './indexStatements';
import { generateDropForeignKey, generateAddForeignKey } from './foreignKeyStatements';
import { generateRenameTable, generateTableOptionsChangeNotice } from './tableStatements';

/**
 * ALTER DDL 生成器
 * 根据 TableDiff 生成各数据库的 ALTER TABLE 语句
 */
export function generateAlterDDL(
  tableName: string,
  diff: TableDiff,
  _fields: NormalizedField[],
  dbType: DatabaseType,
): string {
  if (!diff.hasChanges) {
    return '';
  }

  const statements: string[] = [];
  const activeTableName = diff.tableNameChanged ? diff.newTableName || tableName : tableName;

  if (diff.tableNameChanged) {
    statements.push(generateRenameTable(diff.oldTableName || '', diff.newTableName || '', dbType));
  }

  // 表注释变更 (某些数据库支持)
  if (diff.tableCommentChanged) {
    const commentSql = generateTableCommentAlter(
      activeTableName,
      diff.newTableComment || '',
      dbType,
    );
    if (commentSql) {
      statements.push(commentSql);
    }
  }

  // 1. 处理删除的索引（先删索引，再改字段）
  for (const idxDiff of diff.indexes.filter((i) => i.type === 'remove')) {
    statements.push(generateDropIndex(activeTableName, idxDiff, dbType));
  }

  // 2. 处理删除的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'remove')) {
    statements.push(generateDropColumn(activeTableName, fieldDiff, dbType));
  }

  // 3. 处理重命名的字段（在删除之后、新增之前）
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'rename')) {
    statements.push(generateRenameColumn(activeTableName, fieldDiff, dbType));
    if (fieldDiff.changes?.length && fieldDiff.newField) {
      statements.push(
        generateModifyColumn(
          activeTableName,
          {
            ...fieldDiff,
            type: 'modify',
            fieldName: fieldDiff.newField.name,
          },
          dbType,
        ),
      );
    }
  }

  // 4. 处理新增的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'add')) {
    statements.push(generateAddColumn(activeTableName, fieldDiff, dbType));
  }

  // 5. 处理修改的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'modify')) {
    statements.push(generateModifyColumn(activeTableName, fieldDiff, dbType));
  }

  // 6. 处理新增的索引
  for (const idxDiff of diff.indexes.filter((i) => i.type === 'add')) {
    statements.push(generateAddIndex(activeTableName, idxDiff, dbType));
  }

  // 7. 处理删除的外键（在新增索引之后，避免依赖冲突）
  for (const fkDiff of (diff.foreignKeys || []).filter((f) => f.type === 'remove')) {
    statements.push(generateDropForeignKey(activeTableName, fkDiff, dbType));
  }

  // 8. 处理新增的外键
  for (const fkDiff of (diff.foreignKeys || []).filter((f) => f.type === 'add')) {
    statements.push(generateAddForeignKey(activeTableName, fkDiff, dbType));
  }

  if (diff.miscConfigChanged) {
    statements.push(generateTableOptionsChangeNotice(activeTableName, dbType));
  }

  return statements.filter((s) => s.trim()).join('\n\n');
}
