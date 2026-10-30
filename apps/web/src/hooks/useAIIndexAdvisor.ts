import { useCallback, useReducer } from 'react';
import type { AIIndexAdvisorRequest, AIIndexAdvisorResult } from '@ddlbuilder/shared-types';
import { assertAIIndexAdvisorTarget, requestAIIndexAdvice } from '@/services/aiIndexAdvisorService';
import i18n from '@/i18n';
import { useAIRequestAccess } from './useAIRequestAccess';
import { useLatestRequest } from './useLatestRequest';

interface AIIndexAdvisorState {
  documentKey: string;
  result: AIIndexAdvisorResult | null;
  error: string | null;
}

type AIIndexAdvisorEvent =
  | { type: 'documentChanged' | 'requested' | 'cleared'; documentKey: string }
  | { type: 'succeeded'; documentKey: string; result: AIIndexAdvisorResult }
  | { type: 'failed'; documentKey: string; error: string };

const emptyAdvice = (documentKey: string): AIIndexAdvisorState => ({
  documentKey,
  result: null,
  error: null,
});

function adviceReducer(
  _state: AIIndexAdvisorState,
  event: AIIndexAdvisorEvent,
): AIIndexAdvisorState {
  switch (event.type) {
    case 'documentChanged':
    case 'requested':
    case 'cleared':
      return emptyAdvice(event.documentKey);
    case 'succeeded':
      return { documentKey: event.documentKey, result: event.result, error: null };
    case 'failed':
      return { documentKey: event.documentKey, result: null, error: event.error };
  }
}

export function useAIIndexAdvisor(documentKey: string) {
  const requestAccess = useAIRequestAccess();
  const [state, dispatch] = useReducer(adviceReducer, documentKey, emptyAdvice);
  const { isPending, run, cancel } = useLatestRequest(documentKey);

  if (state.documentKey !== documentKey) dispatch({ type: 'documentChanged', documentKey });

  const analyzeIndexes = useCallback(
    async (payload: AIIndexAdvisorRequest): Promise<AIIndexAdvisorResult | null> => {
      const accessError = requestAccess.getAccessError();

      if (accessError) {
        dispatch({ type: 'failed', documentKey, error: accessError });
        throw new Error(accessError);
      }

      try {
        assertAIIndexAdvisorTarget(payload);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : i18n.t('services.generationFailed');
        dispatch({ type: 'failed', documentKey, error: message });
        throw new Error(message);
      }

      dispatch({ type: 'requested', documentKey });

      return run(async ({ signal, isCurrent, commitIfCurrent }) => {
        try {
          const result = await requestAIIndexAdvice(payload, signal);
          commitIfCurrent(() => {
            dispatch({ type: 'succeeded', documentKey, result });
            requestAccess.refreshCreditsAfterSuccess();
          });

          return result;
        } catch (error) {
          if (!isCurrent() || (error instanceof Error && error.name === 'AbortError')) throw error;

          const message = requestAccess.resolveRequestError(
            error,
            i18n.t('services.generationFailed'),
          );
          dispatch({ type: 'failed', documentKey, error: message });
          throw new Error(message);
        }
      });
    },
    [documentKey, requestAccess, run],
  );

  const clearAdvice = useCallback(() => {
    cancel();
    dispatch({ type: 'cleared', documentKey });
  }, [cancel, documentKey]);

  return {
    isLoading: isPending,
    result: state.result,
    error: state.error,
    analyzeIndexes,
    clearAdvice,
  };
}
