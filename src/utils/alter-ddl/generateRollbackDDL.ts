import type { NormalizedField, DatabaseType } from '@/types';
import type { TableDiff, FieldDiff } from '../tableDiff';
import {
  generateTableCommentAlter,
  generateDropColumn,
  generateRenameColumn,
  generateAddColumn,
  generateModifyColumn,
} from './columnStatements';
import { generateDropIndex, generateAddIndex } from './indexStatements';

/**
 * 生成回滚 DDL 语句（逆向操作）
 * 用于撤销 generateAlterDDL 生成的变更
 */
export function generateRollbackDDL(
  tableName: string,
  diff: TableDiff,
  _fields: NormalizedField[],
  dbType: DatabaseType,
): string {
  if (!diff.hasChanges) {
    return '';
  }

  const statements: string[] = [];

  // 回滚顺序与正向操作相反

  // 1. 删除新增的索引
  for (const idxDiff of diff.indexes.filter((i) => i.type === 'add')) {
    statements.push(generateDropIndex(tableName, { ...idxDiff, type: 'remove' }, dbType));
  }

  // 2. 恢复修改的字段（使用旧字段定义）
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'modify')) {
    if (fieldDiff.oldField) {
      const rollbackDiff: FieldDiff = {
        type: 'modify',
        fieldName: fieldDiff.fieldName,
        oldField: fieldDiff.newField,
        newField: fieldDiff.oldField,
        changes: fieldDiff.changes,
      };
      statements.push(generateModifyColumn(tableName, rollbackDiff, dbType));
    }
  }

  // 3. 删除新增的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'add')) {
    statements.push(generateDropColumn(tableName, { ...fieldDiff, type: 'remove' }, dbType));
  }

  // 4. 恢复重命名的字段（反向重命名）
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'rename')) {
    const rollbackDiff: FieldDiff = {
      type: 'rename',
      fieldName: fieldDiff.oldFieldName || '',
      oldField: fieldDiff.newField,
      newField: fieldDiff.oldField,
      oldFieldName: fieldDiff.newFieldName,
      newFieldName: fieldDiff.oldFieldName,
    };
    statements.push(generateRenameColumn(tableName, rollbackDiff, dbType));
  }

  // 5. 恢复删除的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'remove')) {
    if (fieldDiff.oldField) {
      const rollbackDiff: FieldDiff = {
        type: 'add',
        fieldName: fieldDiff.fieldName,
        newField: fieldDiff.oldField,
      };
      statements.push(generateAddColumn(tableName, rollbackDiff, dbType));
    }
  }

  // 6. 恢复删除的索引
  for (const idxDiff of diff.indexes.filter((i) => i.type === 'remove')) {
    statements.push(generateAddIndex(tableName, { ...idxDiff, type: 'add' }, dbType));
  }

  // 7. 恢复表注释
  if (diff.tableCommentChanged && diff.oldTableComment !== undefined) {
    const commentSql = generateTableCommentAlter(tableName, diff.oldTableComment, dbType);
    if (commentSql) {
      statements.push(commentSql);
    }
  }

  return statements.filter((s) => s.trim()).join('\n\n');
}
