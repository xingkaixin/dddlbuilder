import { useCallback, useState } from 'react';
import type { AIIndexAdvisorRequest, AIIndexAdvisorResult } from '@ddlbuilder/shared-types';
import { assertAIIndexAdvisorTarget, requestAIIndexAdvice } from '@/services/aiIndexAdvisorService';
import i18n from '@/i18n';
import { useAIRequestAccess } from './useAIRequestAccess';
import { useLatestRequest } from './useLatestRequest';

interface AIIndexAdvisorState {
  result: AIIndexAdvisorResult | null;
  error: string | null;
}

export function useAIIndexAdvisor() {
  const requestAccess = useAIRequestAccess();
  const [state, setState] = useState<AIIndexAdvisorState>({
    result: null,
    error: null,
  });
  const { isPending, run, cancel } = useLatestRequest();

  const analyzeIndexes = useCallback(
    async (payload: AIIndexAdvisorRequest): Promise<AIIndexAdvisorResult | null> => {
      const accessError = requestAccess.getAccessError();
      if (accessError) {
        setState({ result: null, error: accessError });
        throw new Error(accessError);
      }

      try {
        assertAIIndexAdvisorTarget(payload);
      } catch (error) {
        const message = (error as Error).message;
        setState({ result: null, error: message });
        throw new Error(message);
      }

      setState({ result: null, error: null });

      return run(async ({ signal, isCurrent, commitIfCurrent }) => {
        try {
          const result = await requestAIIndexAdvice(payload, signal);
          commitIfCurrent(() => {
            setState({ result, error: null });
            requestAccess.refreshCreditsAfterSuccess();
          });
          return result;
        } catch (error) {
          if (!isCurrent() || (error as Error).name === 'AbortError') throw error;

          const message = requestAccess.resolveRequestError(
            error,
            i18n.t('services.generationFailed'),
          );
          setState({ result: null, error: message });
          throw new Error(message);
        }
      });
    },
    [requestAccess, run],
  );

  const clearAdvice = useCallback(() => {
    cancel();
    setState({ result: null, error: null });
  }, [cancel]);

  return {
    isLoading: isPending,
    result: state.result,
    error: state.error,
    analyzeIndexes,
    clearAdvice,
  };
}
