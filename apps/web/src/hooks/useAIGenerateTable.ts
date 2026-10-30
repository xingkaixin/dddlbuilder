import { useCallback, useMemo, useReducer, useRef } from 'react';
import type { DatabaseType, PersistedState } from '@ddlbuilder/shared-types';
import {
  requestGenerateTable,
  type GenerateTableRequestOptions,
} from '@/services/aiGenerateTableService';
import type {
  ConversationMessage,
  GeneratedTableSchema,
  PartialTableSchema,
} from '@ddlbuilder/shared-types/ai-generate';
import { parsePartialTableSchema } from '@/utils/parsePartialTableSchema';
import { useLocale } from '@/i18n/LocaleContext';
import i18n from '@/i18n';
import { useAIRequestAccess } from './useAIRequestAccess';
import { useLatestRequest } from './useLatestRequest';

export type {
  ConversationMessage,
  GeneratedField,
  GeneratedIndex,
  GeneratedTableSchema,
  PartialTableSchema,
} from '@ddlbuilder/shared-types/ai-generate';

interface GenerateState {
  streamingText: string;
  result: GeneratedTableSchema | null;
  resultBaseState: PersistedState | null;
  previousResult: GeneratedTableSchema | null;
  error: string | null;
  conversationHistory: ConversationMessage[];
}

type GenerateEvent =
  | { type: 'inputRejected'; error: string }
  | { type: 'requested' | 'resultCleared' | 'conversationCleared' | 'cancelled' }
  | { type: 'textStreamed'; streamingText: string }
  | {
      type: 'succeeded';
      result: GeneratedTableSchema;
      resultBaseState: PersistedState | null;
      previousResult: GeneratedTableSchema | null;
      conversationHistory: ConversationMessage[];
    }
  | { type: 'failed'; error: string };

const initialGenerateState: GenerateState = {
  streamingText: '',
  result: null,
  resultBaseState: null,
  previousResult: null,
  error: null,
  conversationHistory: [],
};

const clearedResult = (state: GenerateState): GenerateState => ({
  ...initialGenerateState,
  conversationHistory: state.conversationHistory,
});

function generateReducer(state: GenerateState, event: GenerateEvent): GenerateState {
  switch (event.type) {
    case 'inputRejected':
      return { ...state, error: event.error };
    case 'requested':
    case 'resultCleared':
      return clearedResult(state);
    case 'conversationCleared':
      return { ...state, conversationHistory: [] };
    case 'cancelled':
      return { ...state, streamingText: '' };
    case 'textStreamed':
      return { ...state, streamingText: event.streamingText };
    case 'succeeded':
      return {
        streamingText: '',
        result: event.result,
        resultBaseState: event.resultBaseState,
        previousResult: event.previousResult,
        error: null,
        conversationHistory: event.conversationHistory,
      };
    case 'failed':
      return { ...clearedResult(state), error: event.error };
  }
}

type GenerateTableOptions = Omit<
  GenerateTableRequestOptions,
  'conversationHistory' | 'mode' | 'existingConfig'
> & {
  continueConversation?: boolean;
} & (
    | { mode: 'patch'; existingConfig: PersistedState }
    | { mode?: 'generate'; existingConfig?: Partial<PersistedState> }
  );

function appendConversation(
  baseHistory: ConversationMessage[],
  description: string,
  assistantContent: string,
): ConversationMessage[] {
  return [
    ...baseHistory,
    { role: 'user', content: description },
    { role: 'assistant', content: assistantContent },
  ];
}

/**
 * 大师建表工坊 表结构的 Hook
 */
export function useAIGenerateTable() {
  const { resolvedLocale } = useLocale();
  const requestAccess = useAIRequestAccess();

  const [state, dispatch] = useReducer(generateReducer, initialGenerateState);
  const { conversationHistory } = state;
  const conversationIdRef = useRef<string | undefined>(undefined);
  const previousSchemaRef = useRef<GeneratedTableSchema | null>(null);
  const { isPending, run, cancel } = useLatestRequest();

  const partialResult = useMemo<PartialTableSchema | null>(() => {
    if (!isPending || !state.streamingText) {
      return null;
    }

    return parsePartialTableSchema(state.streamingText);
  }, [isPending, state.streamingText]);

  const generateTable = useCallback(
    async (description: string, dbType: DatabaseType, options?: GenerateTableOptions) => {
      if (!description.trim()) {
        dispatch({ type: 'inputRejected', error: i18n.t('services.inputDescribeRequired') });

        return false;
      }

      const accessError = requestAccess.getAccessError();

      if (accessError) {
        dispatch({ type: 'inputRejected', error: accessError });

        return false;
      }

      const baseConversation = options?.continueConversation ? conversationHistory : [];
      const previousSchema = options?.continueConversation ? previousSchemaRef.current : null;
      const normalizedDescription = description.trim();
      const baseState = options?.mode === 'patch' ? structuredClone(options.existingConfig) : null;

      const requestOptions = {
        conversationId: options?.continueConversation ? conversationIdRef.current : undefined,
        mode: options?.mode,
        templates: options?.templates,
        existingConfig: baseState
          ? {
              schemaName: baseState.schemaName,
              tableName: baseState.tableName,
              tableComment: baseState.tableComment,
              rows: baseState.rows,
              indexes: baseState.indexes,
            }
          : options?.existingConfig,
        previousSchema: previousSchema ?? undefined,
        conversationHistory: baseConversation,
      };
      const requestPayload = {
        description: normalizedDescription,
        dbType,
        locale: resolvedLocale,
        options: requestOptions,
      };
      const requestKey = JSON.stringify(requestPayload);

      const succeeded = await run(async ({ signal, isCurrent, commitIfCurrent }) => {
        dispatch({ type: 'requested' });

        try {
          const { fullText, result } = await requestGenerateTable(requestPayload, {
            signal,
            onConversation: (id) => {
              conversationIdRef.current = id;
            },
            onStreamingText: (streamingText) => {
              commitIfCurrent(() => dispatch({ type: 'textStreamed', streamingText }));
            },
          });

          commitIfCurrent(() => {
            dispatch({
              type: 'succeeded',
              result,
              resultBaseState: baseState,
              previousResult: previousSchema,
              conversationHistory: appendConversation(
                baseConversation,
                normalizedDescription,
                fullText,
              ),
            });
            previousSchemaRef.current = result;
            requestAccess.refreshCreditsAfterSuccess();
          });

          return true;
        } catch (error) {
          if (!isCurrent() || (error instanceof Error && error.name === 'AbortError')) throw error;

          dispatch({
            type: 'failed',
            error: requestAccess.resolveRequestError(error, i18n.t('services.generationFailed')),
          });

          return false;
        }
      }, requestKey);

      return succeeded ?? false;
    },
    [conversationHistory, requestAccess, resolvedLocale, run],
  );

  const clearResult = useCallback(() => {
    dispatch({ type: 'resultCleared' });
  }, []);

  const clearConversation = useCallback(() => {
    dispatch({ type: 'conversationCleared' });
    previousSchemaRef.current = null;
  }, []);

  const cancelGeneration = useCallback(() => {
    if (cancel()) dispatch({ type: 'cancelled' });
  }, [cancel]);

  return {
    isLoading: isPending,
    streamingText: state.streamingText,
    error: state.error,
    result: state.result,
    resultBaseState: state.resultBaseState,
    previousResult: state.previousResult,
    partialResult,
    conversationHistory,
    generateTable,
    clearResult,
    clearConversation,
    cancelGeneration,
  };
}
