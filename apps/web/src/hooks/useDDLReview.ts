import { useCallback, useMemo, useReducer } from 'react';
import { parsePartialJson, type PartialReviewResult } from '@/utils/parsePartialJson';
import { requestDDLReview, resumeDDLReview } from '@/services/reviewService';
import { hasResumableAIOperation } from '@/services/aiConversationService';
import { useLocale } from '@/i18n/LocaleContext';
import i18n from '@/i18n';
import { useAIRequestAccess } from './useAIRequestAccess';
import type {
  DDLReviewResult,
  DDLReviewSuggestion,
  DDLReviewStructuredSuggestion,
} from '@ddlbuilder/shared-types/ddl-review';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import { useLatestRequest } from './useLatestRequest';

export type StructuredSuggestion = DDLReviewStructuredSuggestion;

export type ReviewResult = DDLReviewResult;

const STREAMING_COMMIT_INTERVAL_MS = 100;

type ReviewRequestPayload = Parameters<typeof requestDDLReview>[0];

type ReviewStreamOptions = Parameters<typeof resumeDDLReview>[1];

interface ReviewState {
  documentKey: string;
  thinking: string;
  suggestions: readonly DDLReviewSuggestion[];
  streamingText: string;
  result: ReviewResult | null;
  error: string | null;
}

type ReviewEvent =
  | { type: 'requested' | 'cleared'; documentKey: string }
  | { type: 'thinkingStreamed'; thinking: string }
  | { type: 'suggestionsStreamed'; suggestions: readonly DDLReviewSuggestion[] }
  | { type: 'textStreamed'; streamingText: string }
  | { type: 'succeeded'; documentKey: string; result: ReviewResult }
  | { type: 'failed'; documentKey: string; error: string }
  | {
      type: 'resultReplaced';
      documentKey: string;
      nextDocumentKey: string;
      result: ReviewResult | null;
    };

const emptyReview = (documentKey: string): ReviewState => ({
  documentKey,
  thinking: '',
  suggestions: [],
  streamingText: '',
  result: null,
  error: null,
});

function reviewReducer(state: ReviewState, event: ReviewEvent): ReviewState {
  switch (event.type) {
    case 'requested':
    case 'cleared':
      return emptyReview(event.documentKey);
    case 'thinkingStreamed':
      return { ...state, thinking: event.thinking };
    case 'suggestionsStreamed':
      return { ...state, suggestions: event.suggestions };
    case 'textStreamed':
      return { ...state, streamingText: event.streamingText };
    case 'succeeded':
      return {
        ...state,
        documentKey: event.documentKey,
        streamingText: '',
        result: event.result,
        error: null,
      };
    case 'failed':
      return { ...emptyReview(event.documentKey), error: event.error };
    case 'resultReplaced':
      return state.documentKey === event.documentKey
        ? { ...state, result: event.result, documentKey: event.nextDocumentKey }
        : state;
  }
}

export function useDDLReview(documentKey: string, resumeScope: string | null) {
  const { resolvedLocale } = useLocale();
  const requestAccess = useAIRequestAccess();
  const [state, dispatch] = useReducer(reviewReducer, documentKey, emptyReview);
  const { isPending, run, cancel } = useLatestRequest(documentKey, 'detach');
  const isCurrentDocument = state.documentKey === documentKey;
  const isLoading = isCurrentDocument && isPending;

  // Parse partial result from streaming text for progressive rendering
  const partialResult: PartialReviewResult | null = useMemo(() => {
    if (!isLoading || !state.streamingText) {
      return null;
    }

    const partial = parsePartialJson(state.streamingText);

    return {
      ...partial,
      suggestions: state.suggestions.length ? [...state.suggestions] : partial?.suggestions,
    };
  }, [isLoading, state.streamingText, state.suggestions]);

  const runReview = useCallback(
    async (
      requestPayload: ReviewRequestPayload,
      request: (options: ReviewStreamOptions) => Promise<ReviewResult | null>,
    ) => {
      const requestKey = JSON.stringify([documentKey, requestPayload]);

      const result = await run(async ({ signal, isCurrent, commitIfCurrent }) => {
        dispatch({ type: 'requested', documentKey });

        let pendingText: string | null = null;
        let flushTimer: ReturnType<typeof setTimeout> | undefined;

        const commitStreamingText = (streamingText: string) =>
          commitIfCurrent(() => dispatch({ type: 'textStreamed', streamingText }));
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
            onThinking: (thinking) =>
              commitIfCurrent(() => dispatch({ type: 'thinkingStreamed', thinking })),
            onSuggestions: (suggestions) =>
              commitIfCurrent(() => dispatch({ type: 'suggestionsStreamed', suggestions })),
            onStreamingText: (streamingText) => {
              pendingText = streamingText;

              if (flushTimer === undefined) flushStreamingText();
            },
          });

          if (!reviewResult) return undefined;

          commitIfCurrent(() => {
            dispatch({ type: 'succeeded', documentKey, result: reviewResult });
            requestAccess.refreshCreditsAfterSuccess();
          });

          return reviewResult;
        } catch (error) {
          if (!isCurrent() || (error instanceof Error && error.name === 'AbortError')) throw error;

          dispatch({
            type: 'failed',
            documentKey,
            error: requestAccess.resolveRequestError(error, i18n.t('services.reviewFailed')),
          });

          return undefined;
        } finally {
          clearTimeout(flushTimer);
        }
      }, requestKey);

      return result ?? undefined;
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
        dispatch({ type: 'failed', documentKey, error: i18n.t('services.ddlRequired') });

        return;
      }

      const accessError = requestAccess.getAccessError();

      if (accessError) {
        dispatch({ type: 'failed', documentKey, error: accessError });

        return;
      }

      const { payload, resumeKey } = buildRequest(ddl, tableName, dbType);

      return runReview(payload, (options) => requestDDLReview(payload, { ...options, resumeKey }));
    },
    [buildRequest, documentKey, requestAccess, runReview],
  );

  const resumeReview = useCallback(
    async (ddl: string, tableName: string, dbType: DatabaseType) => {
      const { payload, resumeKey } = buildRequest(ddl, tableName, dbType);

      if (!resumeKey || !hasResumableAIOperation(resumeKey)) return;

      return runReview(payload, (options) => resumeDDLReview(resumeKey, options));
    },
    [buildRequest, runReview],
  );

  const clearReview = useCallback(() => {
    cancel();
    dispatch({ type: 'cleared', documentKey });
  }, [cancel, documentKey]);

  const setReviewResult = useCallback(
    (result: ReviewResult | null, nextDocumentKey = documentKey) => {
      dispatch({ type: 'resultReplaced', documentKey, nextDocumentKey, result });
    },
    [documentKey],
  );

  return {
    isLoading,
    thinking: isLoading ? state.thinking : '',
    streamingText: isCurrentDocument ? state.streamingText : '',
    partialResult,
    result: isCurrentDocument ? state.result : null,
    error: isCurrentDocument ? state.error : null,
    startReview,
    resumeReview,
    clearReview,
    setReviewResult,
  };
}
