import { useCallback, useReducer } from 'react';
import type { AICommentMode, AICommentRequest, AICommentResult } from '@ddlbuilder/shared-types';
import { requestAIComments, assertAICommentTarget } from '@/services/aiCommentService';
import { useLocale } from '@/i18n/LocaleContext';
import i18n from '@/i18n';
import { useAIRequestAccess } from './useAIRequestAccess';
import { useLatestRequest } from './useLatestRequest';

interface AICommentState {
  documentKey: string;
  error: string | null;
}

type AICommentEvent =
  | { type: 'documentChanged'; documentKey: string }
  | { type: 'requested' | 'succeeded' | 'cancelled' }
  | { type: 'failed'; error: string };

type GenerateCommentsInput = Omit<AICommentRequest, 'mode' | 'targetLocale'> & {
  mode: AICommentMode;
  targetLocale?: AICommentRequest['targetLocale'];
};

const initialCommentState = (documentKey: string): AICommentState => ({ documentKey, error: null });

function commentReducer(state: AICommentState, event: AICommentEvent): AICommentState {
  switch (event.type) {
    case 'documentChanged':
      return initialCommentState(event.documentKey);
    case 'requested':
    case 'succeeded':
    case 'cancelled':
      return { ...state, error: null };
    case 'failed':
      return { ...state, error: event.error };
  }
}

export function useAIComments(documentKey: string) {
  const requestAccess = useAIRequestAccess();
  const { resolvedLocale } = useLocale();
  const [state, dispatch] = useReducer(commentReducer, documentKey, initialCommentState);
  const { isPending, run, cancel } = useLatestRequest(documentKey);

  if (state.documentKey !== documentKey) dispatch({ type: 'documentChanged', documentKey });

  const generateComments = useCallback(
    async (input: GenerateCommentsInput): Promise<AICommentResult | null> => {
      const accessError = requestAccess.getAccessError();

      if (accessError) {
        dispatch({ type: 'failed', error: accessError });
        throw new Error(accessError);
      }

      const payload: AICommentRequest = {
        ...input,
        targetLocale: input.targetLocale ?? resolvedLocale,
      };

      try {
        assertAICommentTarget(payload);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : i18n.t('services.generationFailed');
        dispatch({ type: 'failed', error: message });
        throw new Error(message);
      }

      dispatch({ type: 'requested' });

      return run(async ({ signal, isCurrent, commitIfCurrent }) => {
        try {
          const result = await requestAIComments(payload, signal);
          commitIfCurrent(() => {
            dispatch({ type: 'succeeded' });
            requestAccess.refreshCreditsAfterSuccess();
          });

          return result;
        } catch (error) {
          if (!isCurrent() || (error instanceof Error && error.name === 'AbortError')) throw error;

          const message = requestAccess.resolveRequestError(
            error,
            i18n.t('services.generationFailed'),
          );
          dispatch({ type: 'failed', error: message });
          throw new Error(message);
        }
      });
    },
    [requestAccess, resolvedLocale, run],
  );

  const cancelComments = useCallback(() => {
    cancel();
    dispatch({ type: 'cancelled' });
  }, [cancel]);

  return {
    isLoading: isPending,
    error: state.error,
    generateComments,
    cancelComments,
  };
}
