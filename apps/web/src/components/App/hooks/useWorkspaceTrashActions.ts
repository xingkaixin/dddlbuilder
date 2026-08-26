import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DraftSummary } from '@ddlbuilder/shared-types/workspace';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SaveTableResult, SavedTableSummary } from '@/hooks/useSavedTables';
import { useToast } from '@/hooks/useToast';
import { getAllFolderTreeNodeIds } from '@/utils/folderModel';

interface UseWorkspaceTrashActionsParams {
  folderTree: FolderTreeNode[];
  trashedTables: SavedTableSummary[];
  trashedDrafts: DraftSummary[];
  restoreTable: (
    normalizedName: string,
    options?: { existingFolderIds?: Set<string> },
  ) => Promise<SaveTableResult>;
  restoreDraftById: (draftId: string) => Promise<void>;
  deleteTablePermanently: (normalizedName: string) => Promise<SaveTableResult>;
  permanentlyDeleteDraftById: (draftId: string) => Promise<void>;
}

export function useWorkspaceTrashActions({
  folderTree,
  trashedTables,
  trashedDrafts,
  restoreTable,
  restoreDraftById,
  deleteTablePermanently,
  permanentlyDeleteDraftById,
}: UseWorkspaceTrashActionsParams) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [isEmptyTrashDialogOpen, setIsEmptyTrashDialogOpen] = useState(false);

  const showActionFailure = useCallback(
    (error: unknown, fallbackKey = 'savedTables.toast.deleteFolderFailed') => {
      showToast(error instanceof Error ? error.message : t(fallbackKey));
    },
    [showToast, t],
  );

  const handleRestoreTable = useCallback(
    (item: SavedTableSummary) => {
      const existingFolderIds = new Set(getAllFolderTreeNodeIds(folderTree));
      void restoreTable(item.normalizedName, { existingFolderIds }).then((result) => {
        showToast(
          result.ok
            ? t('savedTables.restore')
            : (result.message ?? t('savedTables.toast.moveFailed')),
        );
      }, showActionFailure);
    },
    [folderTree, restoreTable, showActionFailure, showToast, t],
  );

  const handleRestoreDraft = useCallback(
    (draftId: string) => {
      void restoreDraftById(draftId).then(
        () => showToast(t('savedTables.restore')),
        showActionFailure,
      );
    },
    [restoreDraftById, showActionFailure, showToast, t],
  );

  const handleDeleteDraftPermanently = useCallback(
    (draftId: string) => {
      void permanentlyDeleteDraftById(draftId).then(
        () => showToast(t('savedTables.deletePermanently')),
        showActionFailure,
      );
    },
    [permanentlyDeleteDraftById, showActionFailure, showToast, t],
  );

  const handleDeleteTablePermanently = useCallback(
    (item: SavedTableSummary) => {
      void deleteTablePermanently(item.normalizedName).then((result) => {
        showToast(
          result.ok
            ? t('savedTables.deletePermanently')
            : (result.message ?? t('savedTables.toast.deleteFolderFailed')),
        );
      }, showActionFailure);
    },
    [deleteTablePermanently, showActionFailure, showToast, t],
  );

  const handleConfirmEmptyTrash = useCallback(() => {
    setIsEmptyTrashDialogOpen(false);
    void Promise.allSettled([
      ...trashedTables.map((item) => deleteTablePermanently(item.normalizedName)),
      ...trashedDrafts.map((draft) =>
        permanentlyDeleteDraftById(draft.draftId).then(() => ({ ok: true as const })),
      ),
    ]).then((results) => {
      const failureCount = results.filter(
        (result) => result.status === 'rejected' || !result.value.ok,
      ).length;
      showToast(
        failureCount > 0
          ? t('savedTables.toast.trashActionFailed', { count: failureCount })
          : t('savedTables.deletePermanently'),
      );
    });
  }, [
    deleteTablePermanently,
    permanentlyDeleteDraftById,
    showToast,
    t,
    trashedDrafts,
    trashedTables,
  ]);
  const handleEmptyTrash = useCallback(() => setIsEmptyTrashDialogOpen(true), []);

  return {
    isEmptyTrashDialogOpen,
    setIsEmptyTrashDialogOpen,
    handleRestoreTable,
    handleRestoreDraft,
    handleDeleteDraftPermanently,
    handleDeleteTablePermanently,
    handleEmptyTrash,
    handleConfirmEmptyTrash,
  };
}
