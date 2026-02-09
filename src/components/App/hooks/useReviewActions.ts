import { useCallback, useEffect, useRef } from 'react';
import type { ReviewResult } from '@/hooks/useDDLReview';
import { saveReview } from '@/utils/reviewHistory';
import { normalizeSavedTableName } from '@/utils/savedTablesDb';
import { reportError } from '@/utils/errorReporter';

type AnalyticsValue = string | number | boolean | null | undefined;

interface UseReviewActionsParams {
  dbType: string;
  tableName: string;
  generatedSql: string;
  loadedTableNormalizedName: string | null;
  isReviewing: boolean;
  reviewResult: ReviewResult | null;
  startReview: (
    ddl: string,
    tableName: string,
    dbType: string,
  ) => Promise<void>;
  setIsReviewHistoryOpen: (open: boolean) => void;
  trackEvent: (
    event: string,
    data?: Record<string, AnalyticsValue>,
  ) => Promise<void> | void;
}

export function useReviewActions({
  dbType,
  tableName,
  generatedSql,
  loadedTableNormalizedName,
  isReviewing,
  reviewResult,
  startReview,
  setIsReviewHistoryOpen,
  trackEvent,
}: UseReviewActionsParams) {
  const handleStartReview = useCallback(() => {
    trackEvent('sql_review_start', { dbType, tableName });
    void startReview(generatedSql, tableName, dbType);
  }, [trackEvent, startReview, generatedSql, tableName, dbType]);

  const isReviewingRef = useRef(false);

  useEffect(() => {
    if (isReviewingRef.current && !isReviewing && reviewResult) {
      const normalizedName =
        loadedTableNormalizedName || normalizeSavedTableName(tableName);
      saveReview(normalizedName, tableName, generatedSql, dbType, reviewResult)
        .then(() => trackEvent('sql_review_complete', { dbType, tableName }))
        .catch((err) =>
          reportError(err, {
            scope: 'App',
            action: 'saveReview',
            metadata: { dbType, tableName, normalizedName },
          }),
        );
    }
    isReviewingRef.current = isReviewing;
  }, [
    reviewResult,
    isReviewing,
    loadedTableNormalizedName,
    tableName,
    generatedSql,
    dbType,
    trackEvent,
  ]);

  const handleViewReviewHistory = useCallback(() => {
    setIsReviewHistoryOpen(true);
  }, [setIsReviewHistoryOpen]);

  return {
    handleStartReview,
    handleViewReviewHistory,
  };
}
