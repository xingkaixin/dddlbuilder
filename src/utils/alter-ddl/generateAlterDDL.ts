import type { NormalizedField, DatabaseType } from '@/types';
import type { TableDiff } from '../tableDiff';
import {
  generateTableCommentAlter,
  generateDropColumn,
  generateRenameColumn,
  generateAddColumn,
  generateModifyColumn,
} from './columnStatements';
import { generateDropIndex, generateAddIndex } from './indexStatements';

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

  // 表注释变更 (某些数据库支持)
  if (diff.tableCommentChanged) {
    const commentSql = generateTableCommentAlter(tableName, diff.newTableComment || '', dbType);
    if (commentSql) {
      statements.push(commentSql);
    }
  }

  // 1. 处理删除的索引（先删索引，再改字段）
  for (const idxDiff of diff.indexes.filter((i) => i.type === 'remove')) {
    statements.push(generateDropIndex(tableName, idxDiff, dbType));
  }

  // 2. 处理删除的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'remove')) {
    statements.push(generateDropColumn(tableName, fieldDiff, dbType));
  }

  // 3. 处理重命名的字段（在删除之后、新增之前）
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'rename')) {
    statements.push(generateRenameColumn(tableName, fieldDiff, dbType));
  }

  // 4. 处理新增的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'add')) {
    statements.push(generateAddColumn(tableName, fieldDiff, dbType));
  }

  // 5. 处理修改的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'modify')) {
    statements.push(generateModifyColumn(tableName, fieldDiff, dbType));
  }

  // 6. 处理新增的索引
  for (const idxDiff of diff.indexes.filter((i) => i.type === 'add')) {
    statements.push(generateAddIndex(tableName, idxDiff, dbType));
  }

  return statements.filter((s) => s.trim()).join('\n\n');
}
