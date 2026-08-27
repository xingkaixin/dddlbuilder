import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AICommentMode, AICommentRequest, AICommentResult } from '@ddlbuilder/shared-types';
import { requestAIComments, assertAICommentTarget } from '@/services/aiCommentService';
import { useLocale } from '@/i18n/LocaleContext';
import i18n from '@/i18n';
import { useAIRequestAccess } from './useAIRequestAccess';

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
  const activeRequestRef = useRef<AbortController | null>(null);
  const { mutateAsync, reset, isPending } = useMutation({
    mutationFn: ({ payload, signal }: { payload: AICommentRequest; signal: AbortSignal }) =>
      requestAIComments(payload, signal),
    retry: false,
  });

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

      activeRequestRef.current?.abort();
      const abortController = new AbortController();
      activeRequestRef.current = abortController;
      setState({ error: null });

      try {
        const result = await mutateAsync({
          payload,
          signal: abortController.signal,
        });
        if (activeRequestRef.current !== abortController) return null;
        setState({ error: null });
        requestAccess.refreshCreditsAfterSuccess();
        return result;
      } catch (error) {
        if (activeRequestRef.current !== abortController) return null;
        if ((error as Error).name === 'AbortError') {
          return null;
        }
        const message = requestAccess.resolveRequestError(
          error,
          i18n.t('services.generationFailed'),
        );
        setState({ error: message });
        throw new Error(message);
      } finally {
        if (activeRequestRef.current === abortController) {
          activeRequestRef.current = null;
        }
      }
    },
    [mutateAsync, requestAccess, resolvedLocale],
  );

  const cancelComments = useCallback(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    reset();
    setState({ error: null });
  }, [reset]);

  return {
    isLoading: isPending,
    error: state.error,
    generateComments,
    cancelComments,
  };
}
