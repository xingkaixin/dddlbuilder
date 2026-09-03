import type { FieldDiff, TableDiff } from '../tableDiff';
import { generateAlterDDL } from './generateAlterDDL';

function reverseFieldDiff(field: FieldDiff): FieldDiff {
  switch (field.type) {
    case 'add':
      return { type: 'remove', fieldName: field.fieldName, oldField: field.newField };
    case 'remove':
      return { type: 'add', fieldName: field.fieldName, newField: field.oldField };
    case 'modify':
      return {
        type: 'modify',
        fieldName: field.fieldName,
        oldField: field.newField,
        newField: field.oldField,
        changes: field.changes,
      };
    case 'rename':
      return {
        type: 'rename',
        fieldName: field.oldField.name,
        oldField: field.newField,
        newField: field.oldField,
        oldFieldName: field.newFieldName,
        newFieldName: field.oldFieldName,
        ...(field.changes ? { changes: field.changes } : {}),
      };
  }
}

export function generateRollbackDDL(diff: TableDiff): string {
  const reversedDiff: TableDiff = {
    ...diff,
    oldDbType: diff.newDbType,
    newDbType: diff.oldDbType,
    oldTableName: diff.newTableName,
    newTableName: diff.oldTableName,
    oldSchemaName: diff.newSchemaName,
    newSchemaName: diff.oldSchemaName,
    oldTableComment: diff.newTableComment,
    newTableComment: diff.oldTableComment,
    oldMiscConfig: diff.newMiscConfig,
    newMiscConfig: diff.oldMiscConfig,
    fields: diff.fields.map(reverseFieldDiff),
    indexes: diff.indexes.map((index) => ({
      ...index,
      type: index.type === 'add' ? 'remove' : 'add',
    })),
    foreignKeys: (diff.foreignKeys || []).map((foreignKey) => ({
      ...foreignKey,
      type: foreignKey.type === 'add' ? 'remove' : 'add',
    })),
  };

  return generateAlterDDL(reversedDiff);
}
