import type { FieldRow, IndexDefinition, PersistedState } from '@ddlbuilder/shared-types';
import type { AISchemaChange } from '@/utils/aiSchemaChanges';
import { removeFieldsFromDocument } from '@/stores/editorDocumentMutations';

type FieldChange = Extract<AISchemaChange, { kind: 'field' }>;

const normalizedName = (value: string) => value.trim().toLowerCase();

const replaceIndex = (indexes: IndexDefinition[], targetName: string, nextIndex: IndexDefinition) =>
  indexes.map((index) =>
    normalizedName(index.name) === normalizedName(targetName)
      ? { ...nextIndex, id: index.id }
      : index,
  );

const applyFieldSchemaChange = (
  state: PersistedState,
  candidateRows: FieldRow[],
  change: FieldChange,
): PersistedState => {
  const rows = state.rows;
  if (change.type === 'add' && change.newRow) {
    const existingIndex = rows.findIndex(
      (row) => normalizedName(row.fieldName) === normalizedName(change.newRow?.fieldName || ''),
    );
    if (existingIndex >= 0) {
      return state;
    }
    const candidateIndex = candidateRows.findIndex(
      (row) => normalizedName(row.fieldName) === normalizedName(change.newRow?.fieldName || ''),
    );
    const insertIndex = candidateIndex >= 0 ? Math.min(candidateIndex, rows.length) : rows.length;
    const nextRows = rows.slice();
    nextRows.splice(insertIndex, 0, change.newRow);
    return { ...state, rows: nextRows };
  }

  if ((change.type === 'modify' || change.type === 'rename') && change.newRow) {
    const nextRow = change.newRow;
    const targetName = change.oldFieldName || change.oldRow?.fieldName || change.fieldName;
    return {
      ...state,
      rows: rows.map((row) =>
        normalizedName(row.fieldName) === normalizedName(targetName)
          ? {
              ...nextRow,
              id: row.id,
            }
          : row,
      ),
    };
  }

  return state;
};

export const applyAISchemaChanges = (
  currentState: PersistedState,
  candidateState: PersistedState,
  changes: AISchemaChange[],
): PersistedState => {
  let nextState = currentState;
  const removedNames = new Set<string>();

  for (const change of changes) {
    if (change.kind === 'table') {
      const key = {
        schema_name: 'schemaName',
        table_name: 'tableName',
        table_comment: 'tableComment',
      }[change.type];
      nextState = { ...nextState, [key]: change.newValue };
      continue;
    }

    if (change.kind === 'field') {
      if (change.type === 'remove') {
        removedNames.add(normalizedName(change.oldRow?.fieldName || change.fieldName));
        continue;
      }
      nextState = applyFieldSchemaChange(nextState, candidateState.rows, change);
      continue;
    }

    const indexes = nextState.indexes || [];
    if (change.type === 'add' && change.newIndex) {
      const exists = indexes.some(
        (index) => normalizedName(index.name) === normalizedName(change.indexName),
      );
      nextState = {
        ...nextState,
        indexes: exists ? indexes : [...indexes, change.newIndex],
      };
    } else if (change.type === 'modify' && change.newIndex) {
      nextState = {
        ...nextState,
        indexes: replaceIndex(indexes, change.indexName, change.newIndex),
      };
    } else if (change.type === 'remove') {
      nextState = {
        ...nextState,
        indexes: indexes.filter(
          (index) => normalizedName(index.name) !== normalizedName(change.indexName),
        ),
      };
    }
  }

  return removedNames.size > 0
    ? removeFieldsFromDocument(nextState, (row) => removedNames.has(normalizedName(row.fieldName)))
    : nextState;
};
