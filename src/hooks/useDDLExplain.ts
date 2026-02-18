import { useState, useCallback, useRef } from 'react';
import { readTextStream } from '@/services/streamingText';
import i18n from '@/i18n';
import { useLocale } from '@/i18n/LocaleContext';

interface ExplainState {
  isLoading: boolean;
  isStreaming: boolean;
  isComplete: boolean;
  explanation: string | null;
  error: string | null;
}

export function useDDLExplain() {
  const { resolvedLocale } = useLocale();
  const [state, setState] = useState<ExplainState>({
    isLoading: false,
    isStreaming: false,
    isComplete: false,
    explanation: null,
    error: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const startExplain = useCallback(
    async (sql: string, context?: string) => {
      if (!sql || sql.trim().length === 0) {
        setState((prev) => ({
          ...prev,
          error: i18n.t('services.explainInvalidSql'),
        }));
        return;
      }

      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setState({
        isLoading: true,
        isStreaming: false,
        isComplete: false,
        explanation: null,
        error: null,
      });

      try {
        const response = await fetch('/api/explain', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sql, context, locale: resolvedLocale }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error ||
              i18n.t('services.requestFailed', { status: response.status }),
          );
        }

        if (!response.body) {
          throw new Error(i18n.t('services.noResponseBody'));
        }

        setState({
          isLoading: false,
          isStreaming: true,
          isComplete: false,
          explanation: '',
          error: null,
        });

        const fullExplanation = await readTextStream(response.body, {
          onUpdate: (explanation) => {
            setState((prev) => ({
              ...prev,
              explanation,
            }));
          },
        });

        setState((prev) => ({
          ...prev,
          isStreaming: false,
          isComplete: true,
          explanation: fullExplanation,
        }));
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return; // Request was cancelled
        }
        setState({
          isLoading: false,
          isStreaming: false,
          isComplete: false,
          explanation: null,
          error:
            error instanceof Error
              ? error.message
              : i18n.t('services.explainFailed'),
        });
      }
    },
    [resolvedLocale],
  );

  const clearExplain = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState({
      isLoading: false,
      isStreaming: false,
      isComplete: false,
      explanation: null,
      error: null,
    });
  }, []);

  return {
    ...state,
    startExplain,
    clearExplain,
  };
}
