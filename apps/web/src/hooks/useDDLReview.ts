import { useState, useCallback, useRef, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { parsePartialJson, type PartialReviewResult } from '@/utils/parsePartialJson';
import { requestDDLReview } from '@/services/reviewService';
import { useLocale } from '@/i18n/LocaleContext';
import i18n from '@/i18n';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import type {
  DDLReviewResult,
  DDLReviewStructuredSuggestion,
} from '@ddlbuilder/shared-types/ddl-review';

export type StructuredSuggestion = DDLReviewStructuredSuggestion;
export type ReviewResult = DDLReviewResult;

interface ReviewState {
  streamingText: string;
  result: ReviewResult | null;
  error: string | null;
}

export function useDDLReview() {
  const { resolvedLocale } = useLocale();
  const authSession = useAuthSession();
  const [state, setState] = useState<ReviewState>({
    streamingText: '',
    result: null,
    error: null,
  });
  const activeRequestRef = useRef<{
    key: string;
    controller: AbortController;
  } | null>(null);
  const reviewMutation = useMutation({
    mutationFn: ({
      payload,
      signal,
      onStreamingText,
    }: {
      payload: Parameters<typeof requestDDLReview>[0];
      signal: AbortSignal;
      onStreamingText: (streamingText: string) => void;
    }) => requestDDLReview(payload, { signal, onStreamingText }),
    retry: false,
  });

  // Parse partial result from streaming text for progressive rendering
  const partialResult: PartialReviewResult | null = useMemo(() => {
    if (!reviewMutation.isPending || !state.streamingText) {
      return null;
    }
    return parsePartialJson(state.streamingText);
  }, [reviewMutation.isPending, state.streamingText]);

  const startReview = useCallback(
    async (ddl: string, tableName: string, dbType: string) => {
      if (!ddl || ddl.trim().length === 0) {
        setState((prev) => ({
          ...prev,
          error: i18n.t('services.ddlRequired'),
        }));
        return;
      }

      if (authSession.status !== 'signed_in' || !authSession.userId) {
        authSession.openAuthDialog();
        setState((prev) => ({
          ...prev,
          error: i18n.t('services.authRequired'),
        }));
        return;
      }

      if (authSession.creditsStatus === 'ready' && (authSession.creditBalance ?? 0) <= 0) {
        setState((prev) => ({
          ...prev,
          error: i18n.t('services.creditExhausted'),
        }));
        return;
      }

      const requestPayload = {
        ddl,
        tableName,
        dbType,
        locale: resolvedLocale,
      };
      const requestKey = JSON.stringify(requestPayload);

      if (activeRequestRef.current) {
        if (activeRequestRef.current.key === requestKey) {
          return;
        }
        activeRequestRef.current.controller.abort();
      }

      const abortController = new AbortController();
      activeRequestRef.current = {
        key: requestKey,
        controller: abortController,
      };

      setState({
        streamingText: '',
        result: null,
        error: null,
      });

      try {
        const result = await reviewMutation.mutateAsync({
          payload: requestPayload,
          signal: abortController.signal,
          onStreamingText: (streamingText) => {
            setState((prev) => ({
              ...prev,
              streamingText,
            }));
          },
        });

        setState({
          streamingText: '',
          result,
          error: null,
        });
        void authSession.refreshCredits();
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return; // Request was cancelled, don't update state
        }
        if ((error as Error).message === i18n.t('services.authRequired')) {
          authSession.openAuthDialog();
        }
        setState({
          streamingText: '',
          result: null,
          error: error instanceof Error ? error.message : i18n.t('services.reviewFailed'),
        });
      } finally {
        if (activeRequestRef.current?.controller === abortController) {
          activeRequestRef.current = null;
        }
      }
    },
    [authSession, resolvedLocale, reviewMutation],
  );

  const clearReview = useCallback(() => {
    if (activeRequestRef.current) {
      activeRequestRef.current.controller.abort();
      activeRequestRef.current = null;
    }
    setState({
      streamingText: '',
      result: null,
      error: null,
    });
    reviewMutation.reset();
  }, [reviewMutation]);

  const setReviewResult = useCallback((result: ReviewResult | null) => {
    setState((prev) => ({ ...prev, result }));
  }, []);

  return {
    isLoading: reviewMutation.isPending,
    streamingText: state.streamingText,
    partialResult,
    result: state.result,
    error: state.error,
    startReview,
    clearReview,
    setReviewResult,
  };
}
