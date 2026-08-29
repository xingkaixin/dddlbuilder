import { useState, useCallback, useRef, useMemo } from 'react';
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
  const [state, setState] = useState<GenerateState>({
    streamingText: '',
    result: null,
    resultBaseState: null,
    previousResult: null,
    error: null,
  });
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
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
        setState((prev) => ({
          ...prev,
          error: i18n.t('services.inputDescribeRequired'),
        }));
        return false;
      }

      const accessError = requestAccess.getAccessError();
      if (accessError) {
        setState((prev) => ({
          ...prev,
          error: accessError,
        }));
        return false;
      }

      const baseConversation = options?.continueConversation ? conversationHistory : [];
      const previousSchema = options?.continueConversation ? previousSchemaRef.current : null;
      const normalizedDescription = description.trim();
      const baseState = options?.mode === 'patch' ? structuredClone(options.existingConfig) : null;
      const requestOptions = {
        mode: options?.mode,
        templates: options?.templates,
        existingConfig: baseState ?? options?.existingConfig,
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
        setState({
          streamingText: '',
          result: null,
          resultBaseState: null,
          previousResult: null,
          error: null,
        });

        try {
          const { fullText, result } = await requestGenerateTable(requestPayload, {
            signal,
            onStreamingText: (streamingText) => {
              commitIfCurrent(() => {
                setState((previous) => ({
                  ...previous,
                  streamingText,
                }));
              });
            },
          });

          commitIfCurrent(() => {
            setState({
              streamingText: '',
              result,
              resultBaseState: baseState,
              previousResult: previousSchema,
              error: null,
            });
            previousSchemaRef.current = result;
            setConversationHistory(
              appendConversation(baseConversation, normalizedDescription, fullText),
            );
            requestAccess.refreshCreditsAfterSuccess();
          });
          return true;
        } catch (error) {
          if (!isCurrent() || (error as Error).name === 'AbortError') throw error;

          setState({
            streamingText: '',
            result: null,
            resultBaseState: null,
            previousResult: null,
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
    setState({
      streamingText: '',
      result: null,
      resultBaseState: null,
      previousResult: null,
      error: null,
    });
  }, []);

  const clearConversation = useCallback(() => {
    setConversationHistory([]);
    previousSchemaRef.current = null;
  }, []);

  const cancelGeneration = useCallback(() => {
    if (cancel()) {
      setState((previous) => ({ ...previous, streamingText: '' }));
    }
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
