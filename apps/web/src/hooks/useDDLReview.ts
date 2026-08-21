import { useState, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { parsePartialJson, type PartialReviewResult } from '@/utils/parsePartialJson';
import { requestDDLReview } from '@/services/reviewService';
import { buildDDLReviewQueryKey } from '@/queryKeys/ai';
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
  isLoading: boolean;
  streamingText: string;
  result: ReviewResult | null;
  error: string | null;
}

const REVIEW_CACHE_STALE_TIME_MS = 5 * 60 * 1000;
const REVIEW_CACHE_GC_TIME_MS = 15 * 60 * 1000;

export function useDDLReview() {
  const { resolvedLocale } = useLocale();
  const authSession = useAuthSession();
  const [state, setState] = useState<ReviewState>({
    isLoading: false,
    streamingText: '',
    result: null,
    error: null,
  });
  const queryClient = useQueryClient();
  const activeRequestRef = useRef<{
    key: string;
    controller: AbortController;
  } | null>(null);

  // Parse partial result from streaming text for progressive rendering
  const partialResult: PartialReviewResult | null = useMemo(() => {
    if (!state.isLoading || !state.streamingText) {
      return null;
    }
    return parsePartialJson(state.streamingText);
  }, [state.isLoading, state.streamingText]);

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

      const queryKey = buildDDLReviewQueryKey({
        ddl,
        tableName,
        dbType,
        locale: resolvedLocale,
      });
      const requestKey = JSON.stringify(queryKey);

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
        isLoading: true,
        streamingText: '',
        result: null,
        error: null,
      });

      try {
        const result = await queryClient.fetchQuery({
          queryKey,
          staleTime: REVIEW_CACHE_STALE_TIME_MS,
          gcTime: REVIEW_CACHE_GC_TIME_MS,
          queryFn: () =>
            requestDDLReview(
              { ddl, tableName, dbType, locale: resolvedLocale },
              {
                signal: abortController.signal,
                onStreamingText: (streamingText) => {
                  setState((prev) => ({
                    ...prev,
                    streamingText,
                  }));
                },
              },
            ),
        });

        setState({
          isLoading: false,
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
          isLoading: false,
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
    [authSession, queryClient, resolvedLocale],
  );

  const clearReview = useCallback(() => {
    if (activeRequestRef.current) {
      activeRequestRef.current.controller.abort();
      activeRequestRef.current = null;
    }
    setState({
      isLoading: false,
      streamingText: '',
      result: null,
      error: null,
    });
  }, []);

  const setReviewResult = useCallback((result: ReviewResult | null) => {
    setState((prev) => ({ ...prev, result }));
  }, []);

  return {
    isLoading: state.isLoading,
    streamingText: state.streamingText,
    partialResult,
    result: state.result,
    error: state.error,
    startReview,
    clearReview,
    setReviewResult,
  };
}
