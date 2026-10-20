import { useCallback, useEffect, useMemo } from 'react';
import { useDDLReview } from '@/hooks/useDDLReview';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { saveReview, type ReviewTarget } from '@/utils/reviewHistory';
import { normalizeSavedTableName } from '@/utils/savedTablesDb';
import { reportError } from '@/utils/errorReporter';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import type { DDLReviewResult } from '@ddlbuilder/shared-types/ddl-review';

interface UseReviewActionsParams {
  documentKey: string;
  getCurrentDocumentKey: () => string;
  dbType: DatabaseType;
  tableName: string;
  generatedSql: string;
  workspaceScope: WorkspaceScope | null;
  loadedTableId: string | null;
  draftId?: string;
  loadedTableNormalizedName: string | null;
  setIsReviewHistoryOpen: (open: boolean) => void;
}

export function useReviewActions({
  documentKey,
  getCurrentDocumentKey,
  dbType,
  tableName,
  generatedSql,
  workspaceScope,
  loadedTableId,
  draftId,
  loadedTableNormalizedName,
  setIsReviewHistoryOpen,
}: UseReviewActionsParams) {
  const normalizedName = loadedTableNormalizedName || normalizeSavedTableName(tableName);

  const reviewTarget = useMemo<ReviewTarget | null>(
    () =>
      workspaceScope
        ? {
            scope: workspaceScope,
            tableId: loadedTableId ?? undefined,
            draftId: loadedTableId ? undefined : draftId,
            normalizedName,
          }
        : null,
    [draftId, loadedTableId, normalizedName, workspaceScope],
  );
  const reviewState = useDDLReview(documentKey, reviewTarget && JSON.stringify(reviewTarget));
  const { startReview, resumeReview } = reviewState;

  const persistReview = useCallback(
    async (result: DDLReviewResult | undefined) => {
      if (!result || !reviewTarget || getCurrentDocumentKey() !== documentKey) return;

      try {
        await saveReview(
          reviewTarget,
          tableName,
          generatedSql,
          dbType,
          result,
          () => getCurrentDocumentKey() === documentKey,
        );
      } catch (error) {
        reportError(error, {
          scope: 'App',
          action: 'saveReview',
          metadata: { dbType, tableName, normalizedName },
        });
      }
    },
    [
      generatedSql,
      tableName,
      dbType,
      reviewTarget,
      normalizedName,
      getCurrentDocumentKey,
      documentKey,
    ],
  );

  useEffect(() => {
    void resumeReview(generatedSql, tableName, dbType).then(persistReview);
  }, [resumeReview, persistReview, generatedSql, tableName, dbType]);

  const handleStartReview = useCallback(async () => {
    await persistReview(await startReview(generatedSql, tableName, dbType));
  }, [startReview, persistReview, generatedSql, tableName, dbType]);

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
