import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { parsePartialJson, type PartialReviewResult } from '@/utils/parsePartialJson';
import { requestDDLReview } from '@/services/reviewService';
import { useLocale } from '@/i18n/LocaleContext';
import i18n from '@/i18n';
import { useAIRequestAccess } from './useAIRequestAccess';
import type {
  DDLReviewResult,
  DDLReviewStructuredSuggestion,
} from '@ddlbuilder/shared-types/ddl-review';

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
  const activeRequestRef = useRef<{
    key: string;
    controller: AbortController;
  } | null>(null);
  useEffect(
    () => () => {
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
    },
    [],
  );
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
  const isCurrentDocument = state.documentKey === documentKey;
  const isLoading = isCurrentDocument && reviewMutation.isPending;

  // Parse partial result from streaming text for progressive rendering
  const partialResult: PartialReviewResult | null = useMemo(() => {
    if (!isLoading || !state.streamingText) {
      return null;
    }
    return parsePartialJson(state.streamingText);
  }, [isLoading, state.streamingText]);

  const startReview = useCallback(
    async (ddl: string, tableName: string, dbType: string) => {
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
        documentKey,
        streamingText: '',
        result: null,
        error: null,
      });

      try {
        const result = await reviewMutation.mutateAsync({
          payload: requestPayload,
          signal: abortController.signal,
          onStreamingText: (streamingText) => {
            if (activeRequestRef.current?.controller !== abortController) return;
            setState((prev) => ({
              ...prev,
              streamingText,
            }));
          },
        });

        if (activeRequestRef.current?.controller !== abortController) return;
        setState({
          documentKey,
          streamingText: '',
          result,
          error: null,
        });
        requestAccess.refreshCreditsAfterSuccess();
        return result;
      } catch (error) {
        if (activeRequestRef.current?.controller !== abortController) return;
        if ((error as Error).name === 'AbortError') {
          return; // Request was cancelled, don't update state
        }
        setState({
          documentKey,
          streamingText: '',
          result: null,
          error: requestAccess.resolveRequestError(error, i18n.t('services.reviewFailed')),
        });
      } finally {
        if (activeRequestRef.current?.controller === abortController) {
          activeRequestRef.current = null;
        }
      }
    },
    [documentKey, requestAccess, resolvedLocale, reviewMutation],
  );

  const clearReview = useCallback(() => {
    if (activeRequestRef.current) {
      activeRequestRef.current.controller.abort();
      activeRequestRef.current = null;
    }
    setState({
      documentKey,
      streamingText: '',
      result: null,
      error: null,
    });
    reviewMutation.reset();
  }, [documentKey, reviewMutation]);

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
