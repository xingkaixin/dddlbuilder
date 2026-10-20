import { useState, useCallback, useLayoutEffect, useMemo } from 'react';
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
  streamingText: string;
  result: ReviewResult | null;
  error: string | null;
}

export function useDDLReview(documentKey: string, resumeScope: string | null) {
  const [thinking, setThinking] = useState('');

  const [suggestions, setSuggestions] = useState<readonly DDLReviewSuggestion[]>([]);
  const { resolvedLocale } = useLocale();
  const requestAccess = useAIRequestAccess();

  const [state, setState] = useState<ReviewState>({
    documentKey,
    streamingText: '',
    result: null,
    error: null,
  });
  const { isPending, run, cancel } = useLatestRequest();
  const isCurrentDocument = state.documentKey === documentKey;
  const isLoading = isCurrentDocument && isPending;

  useLayoutEffect(
    () => () => {
      cancel('detach');
    },
    [cancel, documentKey],
  );

  // Parse partial result from streaming text for progressive rendering
  const partialResult: PartialReviewResult | null = useMemo(() => {
    if (!isLoading || !state.streamingText) {
      return null;
    }

    const partial = parsePartialJson(state.streamingText);

    return {
      ...partial,
      suggestions: suggestions.length ? [...suggestions] : partial?.suggestions,
    };
  }, [isLoading, state.streamingText, suggestions]);

  const runReview = useCallback(
    async (
      requestPayload: ReviewRequestPayload,
      request: (options: ReviewStreamOptions) => Promise<ReviewResult | null>,
    ) => {
      const requestKey = JSON.stringify([documentKey, requestPayload]);

      const result = await run(async ({ signal, isCurrent, commitIfCurrent }) => {
        setThinking('');
        setSuggestions([]);
        setState({
          documentKey,
          streamingText: '',
          result: null,
          error: null,
        });

        let pendingText: string | null = null;
        let flushTimer: ReturnType<typeof setTimeout> | undefined;

        const commitStreamingText = (streamingText: string) =>
          commitIfCurrent(() => {
            setState((previous) => ({ ...previous, streamingText }));
          });
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
            onThinking: (text) => commitIfCurrent(() => setThinking(text)),
            onSuggestions: (items) => commitIfCurrent(() => setSuggestions(items)),
            onStreamingText: (streamingText) => {
              pendingText = streamingText;

              if (flushTimer === undefined) flushStreamingText();
            },
          });

          if (!reviewResult) return undefined;

          commitIfCurrent(() => {
            setState({
              documentKey,
              streamingText: '',
              result: reviewResult,
              error: null,
            });
            requestAccess.refreshCreditsAfterSuccess();
          });

          return reviewResult;
        } catch (error) {
          if (!isCurrent() || (error instanceof Error && error.name === 'AbortError')) throw error;

          setState({
            documentKey,
            streamingText: '',
            result: null,
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
        setThinking('');
        setSuggestions([]);
        setState({
          documentKey,
          streamingText: '',
          result: null,
          error: i18n.t('services.ddlRequired'),
        });

        return;
      }

      const accessError = requestAccess.getAccessError();

      if (accessError) {
        setThinking('');
        setSuggestions([]);
        setState({
          documentKey,
          streamingText: '',
          result: null,
          error: accessError,
        });

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
    setThinking('');
    setSuggestions([]);
    setState({
      documentKey,
      streamingText: '',
      result: null,
      error: null,
    });
  }, [cancel, documentKey]);

  const setReviewResult = useCallback(
    (result: ReviewResult | null, nextDocumentKey = documentKey) => {
      setState((prev) =>
        prev.documentKey === documentKey ? { ...prev, result, documentKey: nextDocumentKey } : prev,
      );
    },
    [documentKey],
  );

  return {
    isLoading,
    thinking: isLoading ? thinking : '',
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
