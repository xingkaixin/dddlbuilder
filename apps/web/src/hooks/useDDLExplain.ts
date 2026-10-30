import { fetchAIConversation } from '@/services/aiConversationService';
import { useCallback, useReducer } from 'react';
import { readTextStream } from '@/services/streamingText';
import i18n from '@/i18n';
import { useLocale } from '@/i18n/LocaleContext';
import { buildAuthenticatedJsonHeaders, readAIErrorMessage } from '@/services/aiApi';
import { useAIRequestAccess } from './useAIRequestAccess';
import { useLatestRequest } from './useLatestRequest';

type ExplainState =
  | { phase: 'idle' | 'loading' }
  | { phase: 'streaming' | 'complete'; explanation: string }
  | { phase: 'error'; error: string };

type ExplainEvent =
  | { type: 'requested' | 'cleared' }
  | { type: 'streamed' | 'completed'; explanation: string }
  | { type: 'failed'; error: string };

const INITIAL_STATE: ExplainState = { phase: 'idle' };

function explainReducer(_state: ExplainState, event: ExplainEvent): ExplainState {
  switch (event.type) {
    case 'requested':
      return { phase: 'loading' };
    case 'cleared':
      return INITIAL_STATE;
    case 'streamed':
      return { phase: 'streaming', explanation: event.explanation };
    case 'completed':
      return { phase: 'complete', explanation: event.explanation };
    case 'failed':
      return { phase: 'error', error: event.error };
  }
}

export function useDDLExplain() {
  const { resolvedLocale } = useLocale();
  const requestAccess = useAIRequestAccess();
  const [state, dispatch] = useReducer(explainReducer, INITIAL_STATE);
  const { run, cancel } = useLatestRequest();

  const startExplain = useCallback(
    async (sql: string, context?: string) => {
      if (!sql.trim()) {
        dispatch({ type: 'failed', error: i18n.t('services.explainInvalidSql') });

        return;
      }

      const accessError = requestAccess.getAccessError();

      if (accessError) {
        dispatch({ type: 'failed', error: accessError });

        return;
      }

      await run(async ({ signal, isCurrent, commitIfCurrent }) => {
        dispatch({ type: 'requested' });

        try {
          const response = await fetchAIConversation('explain', {
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

          commitIfCurrent(() => dispatch({ type: 'streamed', explanation: '' }));

          const explanation = await readTextStream(response.body, {
            debugContext: { route: 'explain', requestId, forceDebug },
            onUpdate: (nextExplanation) => {
              commitIfCurrent(() => dispatch({ type: 'streamed', explanation: nextExplanation }));
            },
          });

          commitIfCurrent(() => {
            dispatch({ type: 'completed', explanation });
            requestAccess.refreshCreditsAfterSuccess();
          });
        } catch (error) {
          if (!isCurrent() || (error instanceof Error && error.name === 'AbortError')) throw error;

          dispatch({
            type: 'failed',
            error: requestAccess.resolveRequestError(error, i18n.t('services.explainFailed')),
          });
        }
      });
    },
    [requestAccess, resolvedLocale, run],
  );

  const clearExplain = useCallback(() => {
    cancel();
    dispatch({ type: 'cleared' });
  }, [cancel]);

  return {
    isLoading: state.phase === 'loading',
    isStreaming: state.phase === 'streaming',
    isComplete: state.phase === 'complete',
    explanation:
      state.phase === 'streaming' || state.phase === 'complete' ? state.explanation : null,
    error: state.phase === 'error' ? state.error : null,
    startExplain,
    clearExplain,
  };
}
