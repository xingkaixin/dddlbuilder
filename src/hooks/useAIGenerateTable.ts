import { useState, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  requestGenerateTable,
  type GenerateTableRequestOptions,
} from '@/services/aiGenerateTableService';
import type {
  ConversationMessage,
  GeneratedTableSchema,
  PartialTableSchema,
} from '@/types/aiGenerate';
import { parsePartialTableSchema } from '@/utils/parsePartialTableSchema';
import { buildAIGenerateQueryKey } from '@/queryKeys/ai';
import { useLocale } from '@/i18n/LocaleContext';
import i18n from '@/i18n';
import { useAuthSession } from '@/auth/AuthSessionProvider';

export type {
  ConversationMessage,
  GeneratedField,
  GeneratedIndex,
  GeneratedTableSchema,
  PartialTableSchema,
} from '@/types/aiGenerate';

interface GenerateState {
  isLoading: boolean;
  streamingText: string;
  result: GeneratedTableSchema | null;
  error: string | null;
}

interface GenerateTableOptions extends Omit<GenerateTableRequestOptions, 'conversationHistory'> {
  continueConversation?: boolean;
}

const AI_GENERATE_CACHE_STALE_TIME_MS = 5 * 60 * 1000;
const AI_GENERATE_CACHE_GC_TIME_MS = 15 * 60 * 1000;

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
  const authSession = useAuthSession();
  const [state, setState] = useState<GenerateState>({
    isLoading: false,
    streamingText: '',
    result: null,
    error: null,
  });
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const queryClient = useQueryClient();
  const conversationHistoryRef = useRef<ConversationMessage[]>([]);
  const activeRequestRef = useRef<{
    key: string;
    controller: AbortController;
  } | null>(null);
  conversationHistoryRef.current = conversationHistory;

  const partialResult = useMemo<PartialTableSchema | null>(() => {
    if (!state.isLoading || !state.streamingText) {
      return null;
    }
    return parsePartialTableSchema(state.streamingText);
  }, [state.isLoading, state.streamingText]);

  const generateTable = useCallback(
    async (description: string, dbType: string, options?: GenerateTableOptions) => {
      if (!description.trim()) {
        setState((prev) => ({
          ...prev,
          error: i18n.t('services.inputDescribeRequired'),
        }));
        return;
      }

      if (authSession.status !== 'signed_in' || !authSession.accessToken) {
        authSession.openAuthDialog();
        setState((prev) => ({
          ...prev,
          error: i18n.t('services.authRequired'),
        }));
        return;
      }

      if (authSession.creditsStatus === 'ready' && (authSession.creditBalance ?? 0) <= 0) {
        setState((prev) => ({
          ...prev,
          error: i18n.t('services.creditExhausted'),
        }));
        return;
      }

      const baseConversation = options?.continueConversation ? conversationHistoryRef.current : [];
      const normalizedDescription = description.trim();
      const requestOptions = {
        templates: options?.templates,
        existingConfig: options?.existingConfig,
        conversationHistory: baseConversation,
      };
      const queryKey = buildAIGenerateQueryKey({
        description: normalizedDescription,
        dbType,
        locale: resolvedLocale,
        templates: requestOptions.templates,
        existingConfig: requestOptions.existingConfig,
        conversationHistory: requestOptions.conversationHistory,
      });
      const requestKey = JSON.stringify(queryKey);

      if (activeRequestRef.current) {
        if (activeRequestRef.current.key === requestKey) {
          return;
        }
        activeRequestRef.current.controller.abort();
      }

      const abortController = new AbortController();
      activeRequestRef.current = {
        key: requestKey,
        controller: abortController,
      };

      setState({
        isLoading: true,
        streamingText: '',
        result: null,
        error: null,
      });

      try {
        const { fullText, result } = await queryClient.fetchQuery({
          queryKey,
          staleTime: AI_GENERATE_CACHE_STALE_TIME_MS,
          gcTime: AI_GENERATE_CACHE_GC_TIME_MS,
          queryFn: () =>
            requestGenerateTable(
              {
                description: normalizedDescription,
                dbType,
                locale: resolvedLocale,
                options: requestOptions,
              },
              {
                signal: abortController.signal,
                onStreamingText: (streamingText) => {
                  setState((prev) => ({
                    ...prev,
                    streamingText,
                  }));
                },
                accessToken: authSession.accessToken,
              },
            ),
        });

        setState({
          isLoading: false,
          streamingText: '',
          result,
          error: null,
        });

        setConversationHistory(() =>
          appendConversation(baseConversation, normalizedDescription, fullText),
        );
        void authSession.refreshCredits();
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        if ((err as Error).message === i18n.t('services.authRequired')) {
          authSession.openAuthDialog();
        }
        setState({
          isLoading: false,
          streamingText: '',
          result: null,
          error: (err as Error).message || i18n.t('services.generationFailed'),
        });
      } finally {
        if (activeRequestRef.current?.controller === abortController) {
          activeRequestRef.current = null;
        }
      }
    },
    [authSession, queryClient, resolvedLocale],
  );

  const clearResult = useCallback(() => {
    setState({
      isLoading: false,
      streamingText: '',
      result: null,
      error: null,
    });
  }, []);

  const clearConversation = useCallback(() => {
    setConversationHistory([]);
  }, []);

  const cancelGeneration = useCallback(() => {
    if (activeRequestRef.current) {
      activeRequestRef.current.controller.abort();
      activeRequestRef.current = null;
      setState((prev) => ({
        ...prev,
        isLoading: false,
      }));
    }
  }, []);

  return {
    isLoading: state.isLoading,
    streamingText: state.streamingText,
    error: state.error,
    result: state.result,
    partialResult,
    conversationHistory,
    generateTable,
    clearResult,
    clearConversation,
    cancelGeneration,
  };
}
