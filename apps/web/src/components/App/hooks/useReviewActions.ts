import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { DDLReviewResult as ReviewResult } from '@ddlbuilder/shared-types/ddl-review';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { saveReview, type ReviewTarget } from '@/utils/reviewHistory';
import { normalizeSavedTableName } from '@/utils/savedTablesDb';
import { reportError } from '@/utils/errorReporter';

interface UseReviewActionsParams {
  dbType: string;
  tableName: string;
  generatedSql: string;
  workspaceScope: WorkspaceScope | null;
  loadedTableId: string | null;
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
  workspaceScope,
  loadedTableId,
  loadedTableNormalizedName,
  isReviewing,
  reviewResult,
  startReview,
  setIsReviewHistoryOpen,
}: UseReviewActionsParams) {
  const normalizedName = loadedTableNormalizedName || normalizeSavedTableName(tableName);
  const reviewTarget = useMemo<ReviewTarget | null>(
    () =>
      workspaceScope
        ? {
            scope: workspaceScope,
            tableId: loadedTableId ?? undefined,
            normalizedName,
          }
        : null,
    [loadedTableId, normalizedName, workspaceScope],
  );
  const handleStartReview = useCallback(() => {
    void startReview(generatedSql, tableName, dbType);
  }, [startReview, generatedSql, tableName, dbType]);

  const isReviewingRef = useRef(false);

  useEffect(() => {
    if (isReviewingRef.current && !isReviewing && reviewResult) {
      if (reviewTarget) {
        saveReview(reviewTarget, tableName, generatedSql, dbType, reviewResult).catch((err) =>
          reportError(err, {
            scope: 'App',
            action: 'saveReview',
            metadata: { dbType, tableName, normalizedName },
          }),
        );
      }
    }
    isReviewingRef.current = isReviewing;
  }, [reviewResult, isReviewing, reviewTarget, tableName, generatedSql, dbType, normalizedName]);

  const handleViewReviewHistory = useCallback(() => {
    setIsReviewHistoryOpen(true);
  }, [setIsReviewHistoryOpen]);

  return {
    reviewTarget,
    handleStartReview,
    handleViewReviewHistory,
  };
}
