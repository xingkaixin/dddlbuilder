import type {
  DatabaseType,
  FieldRow,
  IndexDefinition,
  PersistedState,
} from '@ddlbuilder/shared-types';
import { getSqlIdentifierKey } from '@ddlbuilder/ddl-core';
import type { AISchemaChange } from '@/utils/aiSchemaChanges';
import {
  removeFieldsFromDocument,
  updateDocumentFields,
  updateDocumentTable,
} from '@/stores/editorDocumentMutations';
import { validateDocumentFields } from '@/stores/editorDocumentValidation';

type FieldChange = Extract<AISchemaChange, { kind: 'field' }>;

const upsertIndex = (
  indexes: IndexDefinition[],
  targetName: string,
  nextIndex: IndexDefinition,
  dbType: DatabaseType,
) => {
  const normalizedName = (value: string) => getSqlIdentifierKey(value, dbType);
  const position = indexes.findIndex((index) =>
    nextIndex.id
      ? index.id === nextIndex.id
      : normalizedName(index.name) === normalizedName(targetName),
  );
  if (position < 0) return [...indexes, nextIndex];
  return indexes.map((index, indexPosition) =>
    indexPosition === position ? { ...nextIndex, id: index.id } : index,
  );
};

const applyFieldSchemaChange = (
  state: PersistedState,
  candidateRows: FieldRow[],
  change: FieldChange,
): PersistedState => {
  const normalizedName = (value: string) => getSqlIdentifierKey(value, state.dbType);
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
        (
          change.oldRow?.id
            ? row.id === change.oldRow.id
            : normalizedName(row.fieldName) === normalizedName(targetName)
        )
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
  const normalizedName = (value: string) => getSqlIdentifierKey(value, currentState.dbType);
  const removedIds = new Set<string>();
  const removedNames = new Set<string>();
  for (const change of changes) {
    if (change.kind !== 'field' || change.type !== 'remove') continue;
    if (change.oldRow?.id) {
      removedIds.add(change.oldRow.id);
    } else {
      removedNames.add(normalizedName(change.oldRow?.fieldName || change.fieldName));
    }
  }
  const shouldRemove = (row: FieldRow) =>
    (!!row.id && removedIds.has(row.id)) || removedNames.has(normalizedName(row.fieldName));
  const stateAfterRemovals =
    removedIds.size > 0 || removedNames.size > 0
      ? removeFieldsFromDocument(currentState, shouldRemove)
      : currentState;
  let nextState = {
    ...stateAfterRemovals,
    rows: currentState.rows.filter((row) => !shouldRemove(row)),
  };

  for (const change of changes) {
    if (change.kind !== 'field' || change.type === 'add' || change.type === 'remove') continue;
    nextState = applyFieldSchemaChange(nextState, candidateState.rows, change);
  }
  for (const change of changes) {
    if (change.kind !== 'field' || change.type !== 'add') continue;
    nextState = applyFieldSchemaChange(nextState, candidateState.rows, change);
  }
  nextState = updateDocumentFields(
    stateAfterRemovals,
    nextState.rows.length > 0 ? nextState.rows : stateAfterRemovals.rows,
  );

  const tableChanges: Partial<Pick<PersistedState, 'schemaName' | 'tableName' | 'tableComment'>> =
    {};
  for (const change of changes) {
    if (change.kind === 'table') {
      const key = (
        {
          schema_name: 'schemaName',
          table_name: 'tableName',
          table_comment: 'tableComment',
        } as const
      )[change.type];
      tableChanges[key] = change.newValue;
      continue;
    }

    if (change.kind === 'field') {
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
        indexes: upsertIndex(indexes, change.indexName, change.newIndex, currentState.dbType),
      };
    } else if (change.type === 'remove') {
      nextState = {
        ...nextState,
        indexes: indexes.filter((index) =>
          change.oldIndex?.id
            ? index.id !== change.oldIndex.id
            : normalizedName(index.name) !== normalizedName(change.indexName),
        ),
      };
    }
  }

  nextState = updateDocumentTable(nextState, tableChanges);
  validateDocumentFields(nextState);
  return nextState;
};
