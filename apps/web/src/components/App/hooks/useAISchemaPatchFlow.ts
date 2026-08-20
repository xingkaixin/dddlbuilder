import { useCallback } from 'react';
import type { FieldRow, IndexDefinition, PersistedState } from '@ddlbuilder/shared-types';
import type { AISchemaChange } from '@/utils/aiSchemaChanges';
import { applyFieldSchemaChange } from '../aiSchemaPatchTransition';

interface UseAISchemaPatchFlowParams {
  rows: FieldRow[];
  indexes: IndexDefinition[];
  setRows: (rows: FieldRow[] | ((current: FieldRow[]) => FieldRow[])) => void;
  setIndexes: (
    indexes: IndexDefinition[] | ((current: IndexDefinition[]) => IndexDefinition[]),
  ) => void;
  setSchemaName: (value: string) => void;
  setTableName: (value: string) => void;
  setTableComment: (value: string) => void;
  setActiveTab: (tab: string) => void;
  highlightField: (rowIndex?: number) => void;
  animateIndex: (indexId: string, type: 'add' | 'remove') => Promise<void>;
}

export function useAISchemaPatchFlow({
  rows,
  indexes,
  setRows,
  setIndexes,
  setSchemaName,
  setTableName,
  setTableComment,
  setActiveTab,
  highlightField,
  animateIndex,
}: UseAISchemaPatchFlowParams) {
  const applyChange = useCallback(
    (change: AISchemaChange, candidateState: PersistedState) => {
      if (change.kind === 'table') {
        if (change.type === 'schema_name') setSchemaName(change.newValue);
        else if (change.type === 'table_name') setTableName(change.newValue);
        else setTableComment(change.newValue);
      }

      if (change.kind === 'field') {
        setActiveTab('fields');
        let focusIndex = -1;
        setRows((current) => {
          const transition = applyFieldSchemaChange(current, candidateState.rows, change);
          focusIndex = transition.focusIndex;
          return transition.rows;
        });
        if (focusIndex >= 0) highlightField(focusIndex);
      }

      if (change.kind === 'index') {
        setActiveTab('indexes');
        if (change.type === 'add' && change.newIndex) {
          const nextIndex = change.newIndex;
          setIndexes((current) => [...current, nextIndex]);
          setTimeout(() => void animateIndex(nextIndex.id, 'add'), 50);
        } else if (change.type === 'modify' && change.newIndex) {
          const nextIndex = change.newIndex;
          setIndexes((current) =>
            current.map((index) =>
              index.name.toLowerCase() === change.indexName.toLowerCase()
                ? { ...nextIndex, id: index.id }
                : index,
            ),
          );
          setTimeout(() => void animateIndex(nextIndex.id, 'add'), 50);
        } else if (change.type === 'remove' && change.oldIndex) {
          void animateIndex(change.oldIndex.id, 'remove');
          setTimeout(() => {
            setIndexes((current) =>
              current.filter(
                (index) => index.name.toLowerCase() !== change.indexName.toLowerCase(),
              ),
            );
          }, 500);
        }
      }
    },
    [
      animateIndex,
      highlightField,
      setIndexes,
      setRows,
      setSchemaName,
      setTableComment,
      setTableName,
      setActiveTab,
    ],
  );

  const focusChange = useCallback(
    (change: AISchemaChange) => {
      if (change.kind === 'field') {
        setActiveTab('fields');
        const targetName = change.oldRow?.fieldName || change.newRow?.fieldName || change.fieldName;
        const rowIndex = rows.findIndex(
          (row) => row.fieldName.trim().toLowerCase() === targetName.trim().toLowerCase(),
        );
        if (rowIndex >= 0) highlightField(rowIndex);
        return;
      }

      if (change.kind === 'index') {
        setActiveTab('indexes');
        const targetIndex =
          indexes.find((index) => index.name.toLowerCase() === change.indexName.toLowerCase()) ||
          change.newIndex ||
          change.oldIndex;
        if (targetIndex) {
          void animateIndex(targetIndex.id, change.type === 'remove' ? 'remove' : 'add');
        }
      }
    },
    [animateIndex, highlightField, indexes, rows, setActiveTab],
  );

  return { applyChange, focusChange };
}
