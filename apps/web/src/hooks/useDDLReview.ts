import { useState, useCallback, useMemo } from 'react';
import { parsePartialJson, type PartialReviewResult } from '@/utils/parsePartialJson';
import { requestDDLReview } from '@/services/reviewService';
import { useLocale } from '@/i18n/LocaleContext';
import i18n from '@/i18n';
import { useAIRequestAccess } from './useAIRequestAccess';
import type {
  DDLReviewResult,
  DDLReviewStructuredSuggestion,
} from '@ddlbuilder/shared-types/ddl-review';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import { useLatestRequest } from './useLatestRequest';

export type StructuredSuggestion = DDLReviewStructuredSuggestion;
export type ReviewResult = DDLReviewResult;

interface ReviewState {
  documentKey: string;
  streamingText: string;
  result: ReviewResult | null;
  error: string | null;
}

export function useDDLReview(documentKey: string) {
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

  // Parse partial result from streaming text for progressive rendering
  const partialResult: PartialReviewResult | null = useMemo(() => {
    if (!isLoading || !state.streamingText) {
      return null;
    }
    return parsePartialJson(state.streamingText);
  }, [isLoading, state.streamingText]);

  const startReview = useCallback(
    async (ddl: string, tableName: string, dbType: DatabaseType) => {
      if (!ddl || ddl.trim().length === 0) {
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
        setState({
          documentKey,
          streamingText: '',
          result: null,
          error: accessError,
        });
        return;
      }

      const requestPayload = {
        ddl,
        tableName,
        dbType,
        locale: resolvedLocale,
      };
      const requestKey = JSON.stringify([documentKey, requestPayload]);

      const result = await run(async ({ signal, isCurrent, commitIfCurrent }) => {
        setState({
          documentKey,
          streamingText: '',
          result: null,
          error: null,
        });

        try {
          const reviewResult = await requestDDLReview(requestPayload, {
            signal,
            onStreamingText: (streamingText) => {
              commitIfCurrent(() => {
                setState((previous) => ({
                  ...previous,
                  streamingText,
                }));
              });
            },
          });

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
          if (!isCurrent() || (error as Error).name === 'AbortError') throw error;

          setState({
            documentKey,
            streamingText: '',
            result: null,
            error: requestAccess.resolveRequestError(error, i18n.t('services.reviewFailed')),
          });
          return undefined;
        }
      }, requestKey);

      return result ?? undefined;
    },
    [documentKey, requestAccess, resolvedLocale, run],
  );

  const clearReview = useCallback(() => {
    cancel();
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
    streamingText: isCurrentDocument ? state.streamingText : '',
    partialResult,
    result: isCurrentDocument ? state.result : null,
    error: isCurrentDocument ? state.error : null,
    startReview,
    clearReview,
    setReviewResult,
  };
}
