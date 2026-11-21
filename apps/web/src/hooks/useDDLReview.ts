import { useCallback, useMemo } from 'react';
import { parsePartialJson, type PartialReviewResult } from '@/utils/parsePartialJson';
import { requestDDLReview, resumeDDLReview } from '@/services/reviewService';
import {
  hasAnyResumableAIOperations,
  hasResumableAIOperation,
} from '@/services/aiConversationService';
import { useLocale } from '@/i18n/LocaleContext';
import { i18n } from '@/i18n';
import { useAIRequestAccess } from './useAIRequestAccess';
import type {
  DDLReviewResult,
  DDLReviewStructuredSuggestion,
} from '@ddlbuilder/shared-types/ddl-review';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import { useLatestRequest } from './useLatestRequest';
import { useReviewStore } from '@/stores/reviewStore';

export type StructuredSuggestion = DDLReviewStructuredSuggestion;

export type ReviewResult = DDLReviewResult;

const STREAMING_COMMIT_INTERVAL_MS = 100;

type ReviewRequestPayload = Parameters<typeof requestDDLReview>[0];

type ReviewStreamOptions = Parameters<typeof resumeDDLReview>[1];

export function useDDLReview(documentKey: string, resumeScope: string | null) {
  const { resolvedLocale } = useLocale();
  const requestAccess = useAIRequestAccess();
  const storedDocumentKey = useReviewStore((state) => state.documentKey);
  const thinking = useReviewStore((state) => state.thinking);
  const suggestions = useReviewStore((state) => state.suggestions);
  const streamingText = useReviewStore((state) => state.streamingText);
  const result = useReviewStore((state) => state.result);
  const error = useReviewStore((state) => state.error);
  const { isPending, run, cancel } = useLatestRequest(documentKey, 'detach');
  const isCurrentDocument = storedDocumentKey === documentKey;
  const isLoading = isCurrentDocument && isPending;

  const partialResult: PartialReviewResult | null = useMemo(() => {
    if (!isLoading || !streamingText) {
      return null;
    }

    const partial = parsePartialJson(streamingText);

    return {
      ...partial,
      suggestions: suggestions.length ? [...suggestions] : partial?.suggestions,
    };
  }, [isLoading, streamingText, suggestions]);

  const runReview = useCallback(
    async (
      requestPayload: ReviewRequestPayload,
      request: (options: ReviewStreamOptions) => Promise<ReviewResult | null>,
    ) => {
      const requestKey = JSON.stringify([documentKey, requestPayload]);

      const completed = await run(async ({ signal, isCurrent, commitIfCurrent }) => {
        useReviewStore.getState().startReview(documentKey);

        let pendingText: string | null = null;
        let flushTimer: ReturnType<typeof setTimeout> | undefined;

        const commitStreamingText = (nextStreamingText: string) =>
          commitIfCurrent(() => useReviewStore.getState().setStreamingText(nextStreamingText));
        const flushStreamingText = () => {
          flushTimer = undefined;

          if (pendingText === null) return;

          commitStreamingText(pendingText);
          pendingText = null;
          flushTimer = setTimeout(flushStreamingText, STREAMING_COMMIT_INTERVAL_MS);
        };

        try {
          const reviewResult = await request({
            signal,
            onThinking: (nextThinking) =>
              commitIfCurrent(() => useReviewStore.getState().setThinking(nextThinking)),
            onSuggestions: (nextSuggestions) =>
              commitIfCurrent(() => useReviewStore.getState().setSuggestions(nextSuggestions)),
            onStreamingText: (nextStreamingText) => {
              pendingText = nextStreamingText;

              if (flushTimer === undefined) flushStreamingText();
            },
          });

          if (!reviewResult) return undefined;

          commitIfCurrent(() => {
            useReviewStore.getState().succeedReview(documentKey, reviewResult);
            requestAccess.refreshCreditsAfterSuccess();
          });

          return reviewResult;
        } catch (caught) {
          if (!isCurrent() || (caught instanceof Error && caught.name === 'AbortError')) {
            throw caught;
          }

          useReviewStore
            .getState()
            .failReview(
              documentKey,
              requestAccess.resolveRequestError(caught, i18n.t('services.reviewFailed')),
            );

          return undefined;
        } finally {
          clearTimeout(flushTimer);
        }
      }, requestKey);

      return completed ?? undefined;
    },
    [documentKey, requestAccess, run],
  );

  const buildRequest = useCallback(
    (ddl: string, tableName: string, dbType: DatabaseType) => {
      const payload = { ddl, tableName, dbType, locale: resolvedLocale };

      return {
        payload,
        resumeKey: resumeScope ? JSON.stringify([resumeScope, payload]) : undefined,
      };
    },
    [resolvedLocale, resumeScope],
  );

  const startReview = useCallback(
    async (ddl: string, tableName: string, dbType: DatabaseType) => {
      if (!ddl || ddl.trim().length === 0) {
        useReviewStore.getState().failReview(documentKey, i18n.t('services.ddlRequired'));

        return;
      }

      const accessError = requestAccess.getAccessError();

      if (accessError) {
        useReviewStore.getState().failReview(documentKey, accessError);

        return;
      }

      const { payload, resumeKey } = buildRequest(ddl, tableName, dbType);

      return runReview(payload, (options) => requestDDLReview(payload, { ...options, resumeKey }));
    },
    [buildRequest, documentKey, requestAccess, runReview],
  );

  const resumeReview = useCallback(
    async (ddl: string, tableName: string, dbType: DatabaseType) => {
      if (!resumeScope || !hasAnyResumableAIOperations()) return;

      const { payload, resumeKey } = buildRequest(ddl, tableName, dbType);

      if (!resumeKey || !hasResumableAIOperation(resumeKey)) return;

      return runReview(payload, (options) => resumeDDLReview(resumeKey, options));
    },
    [buildRequest, resumeScope, runReview],
  );

  const clearReview = useCallback(() => {
    cancel();
    useReviewStore.getState().clearReview(documentKey);
  }, [cancel, documentKey]);

  return {
    isLoading,
    thinking: isLoading ? thinking : '',
    streamingText: isCurrentDocument ? streamingText : '',
    partialResult,
    result: isCurrentDocument ? result : null,
    error: isCurrentDocument ? error : null,
    startReview,
    resumeReview,
    clearReview,
  };
}
