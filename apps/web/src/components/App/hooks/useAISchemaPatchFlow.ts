import { useCallback } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { AISchemaChange } from '@/utils/aiSchemaChanges';
import { applyAISchemaChanges } from '../aiSchemaPatchTransition';

interface UseAISchemaPatchFlowParams {
  currentState: PersistedState;
  applyState: (state: PersistedState) => void;
  setActiveTab: (tab: string) => void;
  highlightField: (rowIndex?: number) => void;
  animateIndex: (indexId: string, type: 'add' | 'remove') => Promise<void>;
}

export function useAISchemaPatchFlow({
  currentState,
  applyState,
  setActiveTab,
  highlightField,
  animateIndex,
}: UseAISchemaPatchFlowParams) {
  const applyChanges = useCallback(
    (changes: AISchemaChange[], candidateState: PersistedState) => {
      const nextState = applyAISchemaChanges(currentState, candidateState, changes);
      applyState(nextState);

      const lastStructuralChange = [...changes].reverse().find((change) => change.kind !== 'table');
      if (lastStructuralChange?.kind === 'field') {
        setActiveTab('fields');
        const targetName =
          lastStructuralChange.newRow?.fieldName ||
          lastStructuralChange.oldRow?.fieldName ||
          lastStructuralChange.fieldName;
        const rowIndex = nextState.rows.findIndex(
          (row) => row.fieldName.trim().toLowerCase() === targetName.trim().toLowerCase(),
        );
        if (rowIndex >= 0) highlightField(rowIndex);
      } else if (lastStructuralChange?.kind === 'index') {
        setActiveTab('indexes');
      }

      for (const change of changes) {
        if (change.kind !== 'index' || change.type === 'remove') continue;
        const index = nextState.indexes.find(
          (item) => item.name.toLowerCase() === change.indexName.toLowerCase(),
        );
        if (index) setTimeout(() => void animateIndex(index.id, 'add'), 50);
      }
    },
    [animateIndex, applyState, currentState, highlightField, setActiveTab],
  );

  const focusChange = useCallback(
    (change: AISchemaChange) => {
      if (change.kind === 'field') {
        setActiveTab('fields');
        const targetName = change.oldRow?.fieldName || change.newRow?.fieldName || change.fieldName;
        const rowIndex = currentState.rows.findIndex(
          (row) => row.fieldName.trim().toLowerCase() === targetName.trim().toLowerCase(),
        );
        if (rowIndex >= 0) highlightField(rowIndex);
        return;
      }

      if (change.kind === 'index') {
        setActiveTab('indexes');
        const targetIndex =
          currentState.indexes.find(
            (index) => index.name.toLowerCase() === change.indexName.toLowerCase(),
          ) ||
          change.newIndex ||
          change.oldIndex;
        if (targetIndex) {
          void animateIndex(targetIndex.id, change.type === 'remove' ? 'remove' : 'add');
        }
      }
    },
    [animateIndex, currentState.indexes, currentState.rows, highlightField, setActiveTab],
  );

  return { applyChanges, focusChange };
}
