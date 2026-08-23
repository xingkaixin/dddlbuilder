import type { FieldRow, IndexDefinition, PersistedState } from '@ddlbuilder/shared-types';
import type { AISchemaChange } from '@/utils/aiSchemaChanges';

type FieldChange = Extract<AISchemaChange, { kind: 'field' }>;

const normalizedName = (value: string) => value.trim().toLowerCase();

const replaceIndex = (indexes: IndexDefinition[], targetName: string, nextIndex: IndexDefinition) =>
  indexes.map((index) =>
    normalizedName(index.name) === normalizedName(targetName)
      ? { ...nextIndex, id: index.id }
      : index,
  );

export const applyFieldSchemaChange = (
  rows: FieldRow[],
  candidateRows: FieldRow[],
  change: FieldChange,
) => {
  if (change.type === 'add' && change.newRow) {
    const existingIndex = rows.findIndex(
      (row) => normalizedName(row.fieldName) === normalizedName(change.newRow?.fieldName || ''),
    );
    if (existingIndex >= 0) {
      return { rows, focusIndex: existingIndex };
    }
    const candidateIndex = candidateRows.findIndex(
      (row) => normalizedName(row.fieldName) === normalizedName(change.newRow?.fieldName || ''),
    );
    const insertIndex = candidateIndex >= 0 ? Math.min(candidateIndex, rows.length) : rows.length;
    const nextRows = rows.slice();
    nextRows.splice(insertIndex, 0, change.newRow);
    return { rows: nextRows, focusIndex: candidateIndex };
  }

  if ((change.type === 'modify' || change.type === 'rename') && change.newRow) {
    const nextRow = change.newRow;
    const targetName = change.oldFieldName || change.oldRow?.fieldName || change.fieldName;
    const focusIndex = candidateRows.findIndex((row) => row.fieldName === nextRow.fieldName);
    return {
      rows: rows.map((row) =>
        normalizedName(row.fieldName) === normalizedName(targetName)
          ? {
              ...nextRow,
              id: row.id,
            }
          : row,
      ),
      focusIndex,
    };
  }

  if (change.type === 'remove') {
    const targetName = change.oldRow?.fieldName || change.fieldName;
    const focusIndex = rows.findIndex(
      (row) => normalizedName(row.fieldName) === normalizedName(targetName),
    );
    return {
      rows: rows.filter((row) => normalizedName(row.fieldName) !== normalizedName(targetName)),
      focusIndex,
    };
  }

  return { rows, focusIndex: -1 };
};

export const applyAISchemaChanges = (
  currentState: PersistedState,
  candidateState: PersistedState,
  changes: AISchemaChange[],
): PersistedState => {
  let nextState = currentState;

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
      nextState = {
        ...nextState,
        rows: applyFieldSchemaChange(nextState.rows, candidateState.rows, change).rows,
      };
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

  return nextState;
};
