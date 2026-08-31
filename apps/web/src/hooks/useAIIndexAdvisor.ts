import { useCallback, useLayoutEffect, useState } from 'react';
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

export function useAIIndexAdvisor(documentKey: string) {
  const requestAccess = useAIRequestAccess();
  const [state, setState] = useState<AIIndexAdvisorState>({
    documentKey,
    result: null,
    error: null,
  });
  const { isPending, run, cancel } = useLatestRequest();

  const analyzeIndexes = useCallback(
    async (payload: AIIndexAdvisorRequest): Promise<AIIndexAdvisorResult | null> => {
      const accessError = requestAccess.getAccessError();
      if (accessError) {
        setState({ documentKey, result: null, error: accessError });
        throw new Error(accessError);
      }

      try {
        assertAIIndexAdvisorTarget(payload);
      } catch (error) {
        const message = (error as Error).message;
        setState({ documentKey, result: null, error: message });
        throw new Error(message);
      }

      setState({ documentKey, result: null, error: null });

      return run(async ({ signal, isCurrent, commitIfCurrent }) => {
        try {
          const result = await requestAIIndexAdvice(payload, signal);
          commitIfCurrent(() => {
            setState({ documentKey, result, error: null });
            requestAccess.refreshCreditsAfterSuccess();
          });
          return result;
        } catch (error) {
          if (!isCurrent() || (error as Error).name === 'AbortError') throw error;

          const message = requestAccess.resolveRequestError(
            error,
            i18n.t('services.generationFailed'),
          );
          setState({ documentKey, result: null, error: message });
          throw new Error(message);
        }
      });
    },
    [documentKey, requestAccess, run],
  );

  const clearAdvice = useCallback(() => {
    cancel();
    setState({ documentKey, result: null, error: null });
  }, [cancel, documentKey]);

  useLayoutEffect(() => clearAdvice, [clearAdvice]);

  const isCurrentDocument = state.documentKey === documentKey;

  return {
    isLoading: isCurrentDocument && isPending,
    result: isCurrentDocument ? state.result : null,
    error: isCurrentDocument ? state.error : null,
    analyzeIndexes,
    clearAdvice,
  };
}
