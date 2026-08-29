import { useCallback, useMemo, useState } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';
import type { TableTemplate } from '@/hooks/useTableTemplates';
import { useAIGenerateTable } from '@/hooks/useAIGenerateTable';
import { useTranslation } from 'react-i18next';
import {
  buildAISchemaChanges,
  buildPersistedStateFromAISchema,
  type AISchemaChange,
  type AISchemaChangeStatus,
} from '@/utils/aiSchemaChanges';

export const MAX_PATCH_INPUT_LENGTH = 500;
const EMPTY_CHANGE_STATUSES: Record<string, AISchemaChangeStatus> = {};
export interface AISchemaPatchSessionParams {
  currentState: PersistedState;
  templates?: Array<FieldTemplate | TableTemplate>;
  onApplyChanges: (
    changes: AISchemaChange[],
    candidateState: PersistedState,
    baseState: PersistedState,
  ) => PersistedState;
}

export function useAISchemaPatchSession({
  currentState,
  templates,
  onApplyChanges,
}: AISchemaPatchSessionParams) {
  const { t } = useTranslation();
  const dbType = currentState.dbType;
  const [input, setInput] = useState('');
  const {
    isLoading,
    error,
    result,
    resultBaseState,
    partialResult,
    conversationHistory,
    generateTable,
    clearResult,
    clearConversation,
    cancelGeneration,
  } = useAIGenerateTable();
  const [statusState, setStatusState] = useState(() => ({
    result,
    values: {} as Record<string, AISchemaChangeStatus>,
    expectedState: null as PersistedState | null,
    error: null as string | null,
  }));
  const statuses = statusState.result === result ? statusState.values : EMPTY_CHANGE_STATUSES;
  const expectedState =
    (statusState.result === result && statusState.expectedState) || resultBaseState;
  const updateStatuses = useCallback(
    (
      update: (
        current: Record<string, AISchemaChangeStatus>,
      ) => Record<string, AISchemaChangeStatus>,
      nextExpectedState?: PersistedState,
    ) => {
      setStatusState((current) => ({
        result,
        values: update(current.result === result ? current.values : {}),
        expectedState:
          nextExpectedState ?? (current.result === result ? current.expectedState : null),
        error: null,
      }));
    },
    [result],
  );

  const candidateState = useMemo(() => {
    if (!result || !resultBaseState) return null;
    return buildPersistedStateFromAISchema(result, { baseState: resultBaseState });
  }, [resultBaseState, result]);

  const changes = useMemo(() => {
    if (!candidateState || !resultBaseState) return [];
    return buildAISchemaChanges(resultBaseState, candidateState).map((change) => ({
      ...change,
      status: statuses[change.id] || 'pending',
    }));
  }, [candidateState, resultBaseState, statuses]);

  const pendingChanges = changes.filter((change) => change.status === 'pending');
  const acceptedChanges = changes.filter((change) => change.status === 'accepted');
  const appliedChanges = changes.filter((change) => change.status === 'applied');
  const selectableChanges = changes.filter((change) => change.status !== 'applied');
  const handleGenerate = useCallback(() => {
    const description = input.trim();
    if (!description) return;
    void generateTable(description, dbType, {
      existingConfig: currentState,
      templates,
      mode: 'patch',
      continueConversation: conversationHistory.length > 0,
    });
  }, [conversationHistory.length, currentState, dbType, generateTable, input, templates]);

  const handleReset = useCallback(() => {
    clearResult();
    clearConversation();
    setStatusState({ result: null, values: {}, expectedState: null, error: null });
    setInput('');
  }, [clearConversation, clearResult]);

  const setChangeStatus = useCallback(
    (id: string, status: AISchemaChangeStatus) => {
      updateStatuses((current) => ({ ...current, [id]: status }));
    },
    [updateStatuses],
  );

  const handleAccept = useCallback(
    (change: AISchemaChange) => {
      setChangeStatus(change.id, 'accepted');
    },
    [setChangeStatus],
  );

  const handleApplyAccepted = useCallback(() => {
    if (!candidateState || !expectedState) return;
    let appliedState: PersistedState;
    try {
      appliedState = onApplyChanges(acceptedChanges, candidateState, expectedState);
    } catch (error) {
      setStatusState((current) => ({
        ...current,
        result,
        error: t('aiPatch.applyFailed', {
          reason: error instanceof Error ? error.message : String(error),
        }),
      }));
      return;
    }
    const appliedIds = new Set(acceptedChanges.map((change) => change.id));
    updateStatuses((current) => {
      const next = { ...current };
      for (const id of appliedIds) next[id] = 'applied';
      return next;
    }, appliedState);
  }, [acceptedChanges, candidateState, expectedState, onApplyChanges, result, t, updateStatuses]);

  const handleSelectAll = useCallback(() => {
    updateStatuses((current) => {
      const next = { ...current };
      for (const change of selectableChanges) {
        next[change.id] = 'accepted';
      }
      return next;
    });
  }, [selectableChanges, updateStatuses]);

  const handleUnselectAll = useCallback(() => {
    updateStatuses((current) => {
      const next = { ...current };
      for (const change of selectableChanges) {
        next[change.id] = 'rejected';
      }
      return next;
    });
  }, [selectableChanges, updateStatuses]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value.slice(0, MAX_PATCH_INPUT_LENGTH));
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        handleGenerate();
      }
    },
    [handleGenerate],
  );

  return {
    input,
    isLoading,
    error: (statusState.result === result && statusState.error) || error,
    result,
    partialResult,
    changes,
    pendingChanges,
    acceptedChanges,
    appliedChanges,
    selectableChanges,
    handleGenerate,
    handleReset,
    handleInputChange,
    handleKeyDown,
    handleAccept,
    handleApplyAccepted,
    handleSelectAll,
    handleUnselectAll,
    setChangeStatus,
    cancelGeneration,
  };
}
