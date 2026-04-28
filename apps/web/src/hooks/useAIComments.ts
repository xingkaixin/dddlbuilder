import { useCallback, useRef, useState } from 'react';
import type { AICommentMode, AICommentRequest, AICommentResult } from '@ddlbuilder/shared-types';
import { requestAIComments, assertAICommentTarget } from '@/services/aiCommentService';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { useLocale } from '@/i18n/LocaleContext';
import i18n from '@/i18n';

interface AICommentState {
  isLoading: boolean;
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
    isLoading: false,
    error: null,
  });
  const activeRequestRef = useRef<AbortController | null>(null);

  const generateComments = useCallback(
    async (input: GenerateCommentsInput): Promise<AICommentResult | null> => {
      if (authSession.status !== 'signed_in' || !authSession.userId) {
        authSession.openAuthDialog();
        const message = i18n.t('services.authRequired');
        setState({ isLoading: false, error: message });
        throw new Error(message);
      }

      if (authSession.creditsStatus === 'ready' && (authSession.creditBalance ?? 0) <= 0) {
        const message = i18n.t('services.creditExhausted');
        setState({
          isLoading: false,
          error: message,
        });
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
        setState({ isLoading: false, error: message });
        throw new Error(message);
      }

      activeRequestRef.current?.abort();
      const abortController = new AbortController();
      activeRequestRef.current = abortController;
      setState({ isLoading: true, error: null });

      try {
        const result = await requestAIComments(payload, abortController.signal);
        setState({ isLoading: false, error: null });
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
        setState({
          isLoading: false,
          error: message,
        });
        throw new Error(message);
      } finally {
        if (activeRequestRef.current === abortController) {
          activeRequestRef.current = null;
        }
      }
    },
    [authSession, resolvedLocale],
  );

  const cancelComments = useCallback(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setState((prev) => ({ ...prev, isLoading: false }));
  }, []);

  return {
    isLoading: state.isLoading,
    error: state.error,
    generateComments,
    cancelComments,
  };
}
