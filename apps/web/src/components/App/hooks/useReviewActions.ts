import { useCallback, useEffect, useRef } from 'react';
import type { DDLReviewResult as ReviewResult } from '@ddlbuilder/shared-types/ddl-review';
import { saveReview } from '@/utils/reviewHistory';
import { normalizeSavedTableName } from '@/utils/savedTablesDb';
import { reportError } from '@/utils/errorReporter';

interface UseReviewActionsParams {
  dbType: string;
  tableName: string;
  generatedSql: string;
  loadedTableNormalizedName: string | null;
  isReviewing: boolean;
  reviewResult: ReviewResult | null;
  startReview: (ddl: string, tableName: string, dbType: string) => Promise<void>;
  setIsReviewHistoryOpen: (open: boolean) => void;
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
}: UseReviewActionsParams) {
  const handleStartReview = useCallback(() => {
    void startReview(generatedSql, tableName, dbType);
  }, [startReview, generatedSql, tableName, dbType]);

  const isReviewingRef = useRef(false);

  useEffect(() => {
    if (isReviewingRef.current && !isReviewing && reviewResult) {
      const normalizedName = loadedTableNormalizedName || normalizeSavedTableName(tableName);
      saveReview(normalizedName, tableName, generatedSql, dbType, reviewResult).catch((err) =>
        reportError(err, {
          scope: 'App',
          action: 'saveReview',
          metadata: { dbType, tableName, normalizedName },
        }),
      );
    }
    isReviewingRef.current = isReviewing;
  }, [reviewResult, isReviewing, loadedTableNormalizedName, tableName, generatedSql, dbType]);

  const handleViewReviewHistory = useCallback(() => {
    setIsReviewHistoryOpen(true);
  }, [setIsReviewHistoryOpen]);

  return {
    handleStartReview,
    handleViewReviewHistory,
  };
}
