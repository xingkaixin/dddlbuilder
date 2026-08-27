import { useCallback, useMemo } from 'react';
import { useDDLReview } from '@/hooks/useDDLReview';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { saveReview, type ReviewTarget } from '@/utils/reviewHistory';
import { normalizeSavedTableName } from '@/utils/savedTablesDb';
import { reportError } from '@/utils/errorReporter';

interface UseReviewActionsParams {
  documentKey: string;
  dbType: string;
  tableName: string;
  generatedSql: string;
  workspaceScope: WorkspaceScope | null;
  loadedTableId: string | null;
  loadedTableNormalizedName: string | null;
  setIsReviewHistoryOpen: (open: boolean) => void;
}

export function useReviewActions({
  documentKey,
  dbType,
  tableName,
  generatedSql,
  workspaceScope,
  loadedTableId,
  loadedTableNormalizedName,
  setIsReviewHistoryOpen,
}: UseReviewActionsParams) {
  const reviewState = useDDLReview(documentKey);
  const { startReview } = reviewState;
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
  const handleStartReview = useCallback(async () => {
    const result = await startReview(generatedSql, tableName, dbType);
    if (!result || !reviewTarget) return;
    try {
      await saveReview(reviewTarget, tableName, generatedSql, dbType, result);
    } catch (error) {
      reportError(error, {
        scope: 'App',
        action: 'saveReview',
        metadata: { dbType, tableName, normalizedName },
      });
    }
  }, [startReview, generatedSql, tableName, dbType, reviewTarget, normalizedName]);

  const handleViewReviewHistory = useCallback(() => {
    setIsReviewHistoryOpen(true);
  }, [setIsReviewHistoryOpen]);

  return {
    reviewState,
    reviewTarget,
    handleStartReview,
    handleViewReviewHistory,
  };
}
