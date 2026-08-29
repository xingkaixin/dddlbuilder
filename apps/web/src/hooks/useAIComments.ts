import { useCallback, useState } from 'react';
import type { AICommentMode, AICommentRequest, AICommentResult } from '@ddlbuilder/shared-types';
import { requestAIComments, assertAICommentTarget } from '@/services/aiCommentService';
import { useLocale } from '@/i18n/LocaleContext';
import i18n from '@/i18n';
import { useAIRequestAccess } from './useAIRequestAccess';
import { useLatestRequest } from './useLatestRequest';

interface AICommentState {
  error: string | null;
}

type GenerateCommentsInput = Omit<AICommentRequest, 'mode' | 'targetLocale'> & {
  mode: AICommentMode;
  targetLocale?: AICommentRequest['targetLocale'];
};

export function useAIComments() {
  const requestAccess = useAIRequestAccess();
  const { resolvedLocale } = useLocale();
  const [state, setState] = useState<AICommentState>({
    error: null,
  });
  const { isPending, run, cancel } = useLatestRequest();

  const generateComments = useCallback(
    async (input: GenerateCommentsInput): Promise<AICommentResult | null> => {
      const accessError = requestAccess.getAccessError();
      if (accessError) {
        setState({ error: accessError });
        throw new Error(accessError);
      }

      const payload: AICommentRequest = {
        ...input,
        targetLocale: input.targetLocale ?? resolvedLocale,
      };

      try {
        assertAICommentTarget(payload);
      } catch (error) {
        const message = (error as Error).message;
        setState({ error: message });
        throw new Error(message);
      }

      setState({ error: null });

      return run(async ({ signal, isCurrent, commitIfCurrent }) => {
        try {
          const result = await requestAIComments(payload, signal);
          commitIfCurrent(() => {
            setState({ error: null });
            requestAccess.refreshCreditsAfterSuccess();
          });
          return result;
        } catch (error) {
          if (!isCurrent() || (error as Error).name === 'AbortError') throw error;

          const message = requestAccess.resolveRequestError(
            error,
            i18n.t('services.generationFailed'),
          );
          setState({ error: message });
          throw new Error(message);
        }
      });
    },
    [requestAccess, resolvedLocale, run],
  );

  const cancelComments = useCallback(() => {
    cancel();
    setState({ error: null });
  }, [cancel]);

  return {
    isLoading: isPending,
    error: state.error,
    generateComments,
    cancelComments,
  };
}
