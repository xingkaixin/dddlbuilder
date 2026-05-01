import { useCallback, useRef, useState } from 'react';
import type { AIIndexAdvisorRequest, AIIndexAdvisorResult } from '@ddlbuilder/shared-types';
import { assertAIIndexAdvisorTarget, requestAIIndexAdvice } from '@/services/aiIndexAdvisorService';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import i18n from '@/i18n';

interface AIIndexAdvisorState {
  isLoading: boolean;
  result: AIIndexAdvisorResult | null;
  error: string | null;
}

export function useAIIndexAdvisor() {
  const authSession = useAuthSession();
  const [state, setState] = useState<AIIndexAdvisorState>({
    isLoading: false,
    result: null,
    error: null,
  });
  const activeRequestRef = useRef<AbortController | null>(null);

  const analyzeIndexes = useCallback(
    async (payload: AIIndexAdvisorRequest): Promise<AIIndexAdvisorResult | null> => {
      if (authSession.status !== 'signed_in' || !authSession.userId) {
        authSession.openAuthDialog();
        const message = i18n.t('services.authRequired');
        setState({ isLoading: false, result: null, error: message });
        throw new Error(message);
      }

      if (authSession.creditsStatus === 'ready' && (authSession.creditBalance ?? 0) <= 0) {
        const message = i18n.t('services.creditExhausted');
        setState({ isLoading: false, result: null, error: message });
        throw new Error(message);
      }

      try {
        assertAIIndexAdvisorTarget(payload);
      } catch (error) {
        const message = (error as Error).message;
        setState({ isLoading: false, result: null, error: message });
        throw new Error(message);
      }

      activeRequestRef.current?.abort();
      const abortController = new AbortController();
      activeRequestRef.current = abortController;
      setState({ isLoading: true, result: null, error: null });

      try {
        const result = await requestAIIndexAdvice(payload, abortController.signal);
        setState({ isLoading: false, result, error: null });
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
        setState({ isLoading: false, result: null, error: message });
        throw new Error(message);
      } finally {
        if (activeRequestRef.current === abortController) {
          activeRequestRef.current = null;
        }
      }
    },
    [authSession],
  );

  const clearAdvice = useCallback(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setState({ isLoading: false, result: null, error: null });
  }, []);

  return {
    isLoading: state.isLoading,
    result: state.result,
    error: state.error,
    analyzeIndexes,
    clearAdvice,
  };
}
