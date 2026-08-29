import { useCallback, useState } from 'react';
import { readTextStream } from '@/services/streamingText';
import i18n from '@/i18n';
import { useLocale } from '@/i18n/LocaleContext';
import { buildAuthenticatedJsonHeaders, readAIErrorMessage } from '@/services/aiApi';
import { useAIRequestAccess } from './useAIRequestAccess';
import { useLatestRequest } from './useLatestRequest';

type ExplainPhase = 'idle' | 'loading' | 'streaming' | 'complete' | 'error';

interface ExplainState {
  phase: ExplainPhase;
  explanation: string | null;
  error: string | null;
}

const INITIAL_STATE: ExplainState = {
  phase: 'idle',
  explanation: null,
  error: null,
};

export function useDDLExplain() {
  const { resolvedLocale } = useLocale();
  const requestAccess = useAIRequestAccess();
  const [state, setState] = useState<ExplainState>(INITIAL_STATE);
  const { run, cancel } = useLatestRequest();

  const startExplain = useCallback(
    async (sql: string, context?: string) => {
      if (!sql.trim()) {
        setState({
          phase: 'error',
          explanation: null,
          error: i18n.t('services.explainInvalidSql'),
        });
        return;
      }

      const accessError = requestAccess.getAccessError();
      if (accessError) {
        setState({ phase: 'error', explanation: null, error: accessError });
        return;
      }

      await run(async ({ signal, isCurrent, commitIfCurrent }) => {
        setState({ phase: 'loading', explanation: null, error: null });

        try {
          const response = await fetch('/api/explain', {
            method: 'POST',
            headers: buildAuthenticatedJsonHeaders(),
            credentials: 'include',
            body: JSON.stringify({ sql, context, locale: resolvedLocale }),
            signal,
          });

          if (!response.ok) {
            throw new Error(await readAIErrorMessage(response, 'explainFailed'));
          }

          if (!response.body) {
            throw new Error(i18n.t('services.noResponseBody'));
          }

          const requestId = response.headers?.get?.('X-Request-Id') ?? null;
          const forceDebug = response.headers?.get?.('X-AI-Stream-Debug') === '1';

          commitIfCurrent(() => {
            setState({ phase: 'streaming', explanation: '', error: null });
          });

          const explanation = await readTextStream(response.body, {
            debugContext: { route: 'explain', requestId, forceDebug },
            onUpdate: (nextExplanation) => {
              commitIfCurrent(() => {
                setState((previous) => ({ ...previous, explanation: nextExplanation }));
              });
            },
          });

          commitIfCurrent(() => {
            setState({ phase: 'complete', explanation, error: null });
            requestAccess.refreshCreditsAfterSuccess();
          });
        } catch (error) {
          if (!isCurrent() || (error as Error).name === 'AbortError') throw error;

          setState({
            phase: 'error',
            explanation: null,
            error: requestAccess.resolveRequestError(error, i18n.t('services.explainFailed')),
          });
        }
      });
    },
    [requestAccess, resolvedLocale, run],
  );

  const clearExplain = useCallback(() => {
    cancel();
    setState(INITIAL_STATE);
  }, [cancel]);

  return {
    isLoading: state.phase === 'loading',
    isStreaming: state.phase === 'streaming',
    isComplete: state.phase === 'complete',
    explanation: state.explanation,
    error: state.error,
    startExplain,
    clearExplain,
  };
}
