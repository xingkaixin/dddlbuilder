import { useCallback, useMemo, useReducer } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';
import type { TableTemplate } from '@/hooks/useTableTemplates';
import { useAIGenerateTable, type GeneratedTableSchema } from '@/hooks/useAIGenerateTable';
import { useTranslation } from 'react-i18next';
import {
  buildAISchemaChanges,
  buildPersistedStateFromAISchema,
  type AISchemaChange,
  type AISchemaChangeStatus,
} from '@/utils/aiSchemaChanges';

export const MAX_PATCH_INPUT_LENGTH = 500;
const EMPTY_CHANGE_STATUSES: Record<string, AISchemaChangeStatus> = {};

interface PatchSessionState {
  input: string;
  // Statuses, expected state and apply error belong to this generated result only.
  result: GeneratedTableSchema | null;
  values: Record<string, AISchemaChangeStatus>;
  expectedState: PersistedState | null;
  error: string | null;
}

type PatchSessionEvent =
  | { type: 'inputChanged'; input: string }
  | { type: 'reset' }
  | {
      type: 'statusesChanged';
      result: GeneratedTableSchema | null;
      ids: readonly string[];
      status: AISchemaChangeStatus;
      expectedState?: PersistedState;
    }
  | { type: 'applyFailed'; result: GeneratedTableSchema | null; error: string };

const createPatchSessionState = (result: GeneratedTableSchema | null): PatchSessionState => ({
  input: '',
  result,
  values: {},
  expectedState: null,
  error: null,
});

function patchSessionReducer(
  state: PatchSessionState,
  event: PatchSessionEvent,
): PatchSessionState {
  switch (event.type) {
    case 'inputChanged':
      return { ...state, input: event.input };
    case 'reset':
      return createPatchSessionState(null);
    case 'statusesChanged': {
      const isSameResult = state.result === event.result;
      const values: Record<string, AISchemaChangeStatus> = isSameResult ? { ...state.values } : {};

      for (const id of event.ids) values[id] = event.status;

      return {
        ...state,
        result: event.result,
        values,
        expectedState: event.expectedState ?? (isSameResult ? state.expectedState : null),
        error: null,
      };
    }

    case 'applyFailed':
      return { ...state, result: event.result, error: event.error };
  }
}

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
  const [session, dispatch] = useReducer(patchSessionReducer, result, createPatchSessionState);
  const { input } = session;
  const isSessionResult = session.result === result;
  const statuses = isSessionResult ? session.values : EMPTY_CHANGE_STATUSES;
  const expectedState = (isSessionResult && session.expectedState) || resultBaseState;

  const candidateState = useMemo(() => {
    if (!result || !resultBaseState) return null;

    return buildPersistedStateFromAISchema(result, { baseState: resultBaseState });
  }, [resultBaseState, result]);

  const originalChanges = useMemo(() => {
    if (!candidateState || !resultBaseState) return [];

    return buildAISchemaChanges(resultBaseState, candidateState);
  }, [candidateState, resultBaseState]);

  const changes = useMemo(() => {
    if (!candidateState || !expectedState) return [];

    const applied = originalChanges
      .filter((change) => statuses[change.id] === 'applied')
      .map((change) => ({ ...change, status: 'applied' as const }));
    const appliedIds = new Set(applied.map((change) => change.id));

    const remaining = buildAISchemaChanges(expectedState, candidateState)
      .filter((change) => !appliedIds.has(change.id))
      .map((change) => ({
        ...change,
        status: statuses[change.id] || 'pending',
      }));

    return [...applied, ...remaining];
  }, [candidateState, expectedState, originalChanges, statuses]);

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
    dispatch({ type: 'reset' });
  }, [clearConversation, clearResult]);

  const setChangeStatus = useCallback(
    (id: string, status: AISchemaChangeStatus) => {
      dispatch({ type: 'statusesChanged', result, ids: [id], status });
    },
    [result],
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
      dispatch({
        type: 'applyFailed',
        result,
        error: t('aiPatch.applyFailed', {
          reason: error instanceof Error ? error.message : String(error),
        }),
      });

      return;
    }

    dispatch({
      type: 'statusesChanged',
      result,
      ids: acceptedChanges.map((change) => change.id),
      status: 'applied',
      expectedState: appliedState,
    });
  }, [acceptedChanges, candidateState, expectedState, onApplyChanges, result, t]);

  const handleSelectAll = useCallback(() => {
    dispatch({
      type: 'statusesChanged',
      result,
      ids: selectableChanges.map((change) => change.id),
      status: 'accepted',
    });
  }, [result, selectableChanges]);

  const handleUnselectAll = useCallback(() => {
    dispatch({
      type: 'statusesChanged',
      result,
      ids: selectableChanges.map((change) => change.id),
      status: 'rejected',
    });
  }, [result, selectableChanges]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    dispatch({ type: 'inputChanged', input: event.target.value.slice(0, MAX_PATCH_INPUT_LENGTH) });
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
    error: (isSessionResult && session.error) || error,
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
