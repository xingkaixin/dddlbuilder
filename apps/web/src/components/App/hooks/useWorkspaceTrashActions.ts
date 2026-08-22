import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DraftSummary } from '@ddlbuilder/shared-types/workspace';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SaveTableResult, SavedTableSummary } from '@/hooks/useSavedTables';
import { useToast } from '@/hooks/useToast';

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
  permanentlyDeleteDraftById: (draftId: string) => void;
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

  const handleRestoreTable = useCallback(
    (item: SavedTableSummary) => {
      const existingFolderIds = new Set(folderTree.map((folder) => folder.id));
      void restoreTable(item.normalizedName, { existingFolderIds }).then((result) => {
        showToast(
          result.ok
            ? t('savedTables.restore')
            : (result.message ?? t('savedTables.toast.moveFailed')),
        );
      });
    },
    [folderTree, restoreTable, showToast, t],
  );

  const handleRestoreDraft = useCallback(
    (draftId: string) => {
      void restoreDraftById(draftId).then(() => showToast(t('savedTables.restore')));
    },
    [restoreDraftById, showToast, t],
  );

  const handleDeleteDraftPermanently = useCallback(
    (draftId: string) => {
      permanentlyDeleteDraftById(draftId);
      showToast(t('savedTables.deletePermanently'));
    },
    [permanentlyDeleteDraftById, showToast, t],
  );

  const handleDeleteTablePermanently = useCallback(
    (item: SavedTableSummary) => {
      void deleteTablePermanently(item.normalizedName).then((result) => {
        showToast(
          result.ok
            ? t('savedTables.deletePermanently')
            : (result.message ?? t('savedTables.toast.deleteFolderFailed')),
        );
      });
    },
    [deleteTablePermanently, showToast, t],
  );

  const handleConfirmEmptyTrash = useCallback(() => {
    setIsEmptyTrashDialogOpen(false);
    void Promise.all([
      ...trashedTables.map((item) => deleteTablePermanently(item.normalizedName)),
      ...trashedDrafts.map(async (draft) => {
        permanentlyDeleteDraftById(draft.draftId);
        return { ok: true as const };
      }),
    ]).then(() => showToast(t('savedTables.deletePermanently')));
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
