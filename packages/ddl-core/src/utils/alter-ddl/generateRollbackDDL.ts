import type { NormalizedField, DatabaseType } from '@ddlbuilder/shared-types';
import type { TableDiff } from '../tableDiff';
import { generateAlterDDL } from './generateAlterDDL';

export function generateRollbackDDL(
  tableName: string,
  diff: TableDiff,
  fields: NormalizedField[],
  dbType: DatabaseType,
): string {
  const reversedDiff: TableDiff = {
    ...diff,
    oldTableName: diff.newTableName,
    newTableName: diff.oldTableName,
    oldTableComment: diff.newTableComment,
    newTableComment: diff.oldTableComment,
    oldMiscConfig: diff.newMiscConfig,
    newMiscConfig: diff.oldMiscConfig,
    fields: diff.fields.map((field) => ({
      ...field,
      type: field.type === 'add' ? 'remove' : field.type === 'remove' ? 'add' : field.type,
      fieldName: field.oldFieldName ?? field.fieldName,
      oldField: field.newField,
      newField: field.oldField,
      oldFieldName: field.newFieldName,
      newFieldName: field.oldFieldName,
    })),
    indexes: diff.indexes.map((index) => ({
      ...index,
      type: index.type === 'add' ? 'remove' : 'add',
    })),
    foreignKeys: (diff.foreignKeys || []).map((foreignKey) => ({
      ...foreignKey,
      type: foreignKey.type === 'add' ? 'remove' : 'add',
    })),
  };

  return generateAlterDDL(tableName, reversedDiff, fields, dbType);
}
