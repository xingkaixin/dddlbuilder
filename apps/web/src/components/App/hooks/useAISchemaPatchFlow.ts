import { useCallback } from 'react';
import { getSqlIdentifierKey } from '@ddlbuilder/ddl-core';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { AISchemaChange } from '@/utils/aiSchemaChanges';
import type { BuilderTab } from '@/utils/tabUtils';
import { applyAISchemaChanges } from '../aiSchemaPatchTransition';
import { buildSchemaStateSignature } from '@/utils/persistedStateSignature';
import i18n from '@/i18n';

interface UseAISchemaPatchFlowParams {
  currentState: PersistedState;
  applyState: (state: PersistedState) => void;
  setActiveTab: (tab: BuilderTab) => void;
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
    (changes: AISchemaChange[], candidateState: PersistedState, baseState: PersistedState) => {
      if (buildSchemaStateSignature(currentState) !== buildSchemaStateSignature(baseState)) {
        throw new Error(i18n.t('aiPatch.staleResult'));
      }
      const nextState = applyAISchemaChanges(currentState, candidateState, changes);
      applyState(nextState);
      const key = (name: string) => getSqlIdentifierKey(name, currentState.dbType);

      const lastStructuralChange = [...changes].reverse().find((change) => change.kind !== 'table');
      if (lastStructuralChange?.kind === 'field') {
        setActiveTab('fields');
        const targetName =
          lastStructuralChange.newRow?.fieldName ||
          lastStructuralChange.oldRow?.fieldName ||
          lastStructuralChange.fieldName;
        const rowIndex = nextState.rows.findIndex((row) => key(row.fieldName) === key(targetName));
        if (rowIndex >= 0) highlightField(rowIndex);
      } else if (lastStructuralChange?.kind === 'index') {
        setActiveTab('indexes');
      }

      for (const change of changes) {
        if (change.kind !== 'index' || change.type === 'remove') continue;
        const index = nextState.indexes.find((item) => key(item.name) === key(change.indexName));
        if (index) setTimeout(() => void animateIndex(index.id, 'add'), 50);
      }
      return nextState;
    },
    [animateIndex, applyState, currentState, highlightField, setActiveTab],
  );

  const focusChange = useCallback(
    (change: AISchemaChange) => {
      const key = (name: string) => getSqlIdentifierKey(name, currentState.dbType);
      if (change.kind === 'field') {
        setActiveTab('fields');
        const targetName = change.oldRow?.fieldName || change.newRow?.fieldName || change.fieldName;
        const rowIndex = currentState.rows.findIndex(
          (row) => key(row.fieldName) === key(targetName),
        );
        if (rowIndex >= 0) highlightField(rowIndex);
        return;
      }

      if (change.kind === 'index') {
        setActiveTab('indexes');
        const targetIndex =
          currentState.indexes.find((index) => key(index.name) === key(change.indexName)) ||
          change.newIndex ||
          change.oldIndex;
        if (targetIndex) {
          void animateIndex(targetIndex.id, change.type === 'remove' ? 'remove' : 'add');
        }
      }
    },
    [
      animateIndex,
      currentState.dbType,
      currentState.indexes,
      currentState.rows,
      highlightField,
      setActiveTab,
    ],
  );

  return { applyChanges, focusChange };
}
