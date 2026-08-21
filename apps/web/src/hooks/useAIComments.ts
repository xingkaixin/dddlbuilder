import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AICommentMode, AICommentRequest, AICommentResult } from '@ddlbuilder/shared-types';
import { requestAIComments, assertAICommentTarget } from '@/services/aiCommentService';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { useLocale } from '@/i18n/LocaleContext';
import i18n from '@/i18n';

interface AICommentState {
  error: string | null;
}

type GenerateCommentsInput = Omit<AICommentRequest, 'mode' | 'targetLocale'> & {
  mode: AICommentMode;
  targetLocale?: AICommentRequest['targetLocale'];
};

export function useAIComments() {
  const authSession = useAuthSession();
  const { resolvedLocale } = useLocale();
  const [state, setState] = useState<AICommentState>({
    error: null,
  });
  const activeRequestRef = useRef<AbortController | null>(null);
  const commentsMutation = useMutation({
    mutationFn: ({ payload, signal }: { payload: AICommentRequest; signal: AbortSignal }) =>
      requestAIComments(payload, signal),
    retry: false,
  });

  const generateComments = useCallback(
    async (input: GenerateCommentsInput): Promise<AICommentResult | null> => {
      if (authSession.status !== 'signed_in' || !authSession.userId) {
        authSession.openAuthDialog();
        const message = i18n.t('services.authRequired');
        setState({ error: message });
        throw new Error(message);
      }

      if (authSession.creditsStatus === 'ready' && (authSession.creditBalance ?? 0) <= 0) {
        const message = i18n.t('services.creditExhausted');
        setState({ error: message });
        throw new Error(message);
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
        const result = await commentsMutation.mutateAsync({
          payload,
          signal: abortController.signal,
        });
        setState({ error: null });
        void authSession.refreshCredits();
        return result;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return null;
        }
        if ((error as Error).message === i18n.t('services.authRequired')) {
          authSession.openAuthDialog();
        }
        const message = (error as Error).message || i18n.t('services.generationFailed');
        setState({ error: message });
        throw new Error(message);
      } finally {
        if (activeRequestRef.current === abortController) {
          activeRequestRef.current = null;
        }
      }
    },
    [authSession, commentsMutation, resolvedLocale],
  );

  const cancelComments = useCallback(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    commentsMutation.reset();
    setState((previous) => ({ ...previous }));
  }, [commentsMutation]);

  return {
    isLoading: commentsMutation.isPending,
    error: state.error,
    generateComments,
    cancelComments,
  };
}
