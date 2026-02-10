import { useState, useCallback, useRef, useMemo } from 'react';
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

interface GenerateTableOptions
  extends Omit<GenerateTableRequestOptions, 'conversationHistory'> {
  continueConversation?: boolean;
}

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
  const [state, setState] = useState<GenerateState>({
    isLoading: false,
    streamingText: '',
    result: null,
    error: null,
  });
  const [conversationHistory, setConversationHistory] = useState<
    ConversationMessage[]
  >([]);
  const conversationHistoryRef = useRef<ConversationMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  conversationHistoryRef.current = conversationHistory;

  const partialResult = useMemo<PartialTableSchema | null>(() => {
    if (!state.isLoading || !state.streamingText) {
      return null;
    }
    return parsePartialTableSchema(state.streamingText);
  }, [state.isLoading, state.streamingText]);

  const generateTable = useCallback(
    async (
      description: string,
      dbType: string,
      options?: GenerateTableOptions,
    ) => {
      if (!description.trim()) {
        setState((prev) => ({ ...prev, error: '请输入表结构描述' }));
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setState({
        isLoading: true,
        streamingText: '',
        result: null,
        error: null,
      });

      const baseConversation = options?.continueConversation
        ? conversationHistoryRef.current
        : [];

      try {
        const { fullText, result } = await requestGenerateTable(
          {
            description,
            dbType,
            options: {
              templates: options?.templates,
              existingConfig: options?.existingConfig,
              conversationHistory: baseConversation,
            },
          },
          {
            signal: abortController.signal,
            onStreamingText: (streamingText) => {
              setState((prev) => ({
                ...prev,
                streamingText,
              }));
            },
          },
        );

        setState({
          isLoading: false,
          streamingText: '',
          result,
          error: null,
        });

        setConversationHistory(() =>
          appendConversation(baseConversation, description, fullText),
        );
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        setState({
          isLoading: false,
          streamingText: '',
          result: null,
          error: (err as Error).message || 'Generation failed',
        });
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [],
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
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
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
