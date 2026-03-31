import { useState, useCallback, useRef } from 'react';
import { readTextStream } from '@/services/streamingText';
import { logAiStreamDebug } from '@/services/aiStreamDebug';
import i18n from '@/i18n';
import { useLocale } from '@/i18n/LocaleContext';

interface ExplainState {
  isLoading: boolean;
  isStreaming: boolean;
  isComplete: boolean;
  explanation: string | null;
  error: string | null;
  requestId: string | null;
  debugEnabled: boolean;
}

export function useDDLExplain() {
  const { resolvedLocale } = useLocale();
  const [state, setState] = useState<ExplainState>({
    isLoading: false,
    isStreaming: false,
    isComplete: false,
    explanation: null,
    error: null,
    requestId: null,
    debugEnabled: false,
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

      logAiStreamDebug('ai_explain_request_start', {
        route: 'explain',
        locale: resolvedLocale,
        sqlLength: sql.length,
        contextLength: context?.length ?? 0,
      });

      setState({
        isLoading: true,
        isStreaming: false,
        isComplete: false,
        explanation: null,
        error: null,
        requestId: null,
        debugEnabled: false,
      });
      logAiStreamDebug('ai_explain_state_transition', {
        route: 'explain',
        phase: 'loading',
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
        const requestId = response.headers?.get?.('x-request-id') ?? null;
        const serverDebugEnabled = response.headers?.get?.('x-ai-stream-debug') === '1';

        logAiStreamDebug(
          'ai_explain_response',
          {
            route: 'explain',
            requestId,
            ok: response.ok,
            status: response.status,
            bodyExists: response.body !== null,
            contentType: response.headers?.get?.('content-type') ?? null,
            serverDebugEnabled,
          },
          { force: serverDebugEnabled },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || i18n.t('services.requestFailed', { status: response.status }),
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
          requestId,
          debugEnabled: serverDebugEnabled,
        });
        logAiStreamDebug(
          'ai_explain_state_transition',
          {
            route: 'explain',
            requestId,
            phase: 'streaming',
          },
          { force: serverDebugEnabled },
        );

        const fullExplanation = await readTextStream(response.body, {
          debugContext: {
            route: 'explain',
            requestId,
            forceDebug: serverDebugEnabled,
          },
          onUpdate: (explanation) => {
            setState((prev) => ({
              ...prev,
              explanation,
            }));
            logAiStreamDebug(
              'ai_explain_text_state_update',
              {
                route: 'explain',
                requestId,
                explanationLength: explanation.length,
              },
              { force: serverDebugEnabled },
            );
          },
        });

        setState((prev) => ({
          ...prev,
          isStreaming: false,
          isComplete: true,
          explanation: fullExplanation,
          requestId,
          debugEnabled: serverDebugEnabled,
        }));
        logAiStreamDebug(
          'ai_explain_state_transition',
          {
            route: 'explain',
            requestId,
            phase: 'complete',
            explanationLength: fullExplanation.length,
          },
          { force: serverDebugEnabled },
        );
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          logAiStreamDebug('ai_explain_request_aborted', {
            route: 'explain',
          });
          return; // Request was cancelled
        }
        setState({
          isLoading: false,
          isStreaming: false,
          isComplete: false,
          explanation: null,
          error: error instanceof Error ? error.message : i18n.t('services.explainFailed'),
          requestId: null,
          debugEnabled: false,
        });
        logAiStreamDebug('ai_explain_state_transition', {
          route: 'explain',
          phase: 'error',
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : 'Unknown explain error',
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
      requestId: null,
      debugEnabled: false,
    });
    logAiStreamDebug('ai_explain_state_transition', {
      route: 'explain',
      phase: 'cleared',
    });
  }, []);

  return {
    ...state,
    startExplain,
    clearExplain,
  };
}
