import { type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { SaveTableResult, SavedTableSummary } from '@/hooks/useSavedTables';
import type { UseDialogStateReturn } from '@/hooks/useDialogState';
import { DEFAULT_SAVED_TABLE_NAME } from '@/utils/savedTablesDb';

type RenameDialogData = {
  name: string;
  target: SavedTableSummary | null;
};

type DeleteDialogData = {
  target: SavedTableSummary | null;
};

interface UseRenameDeleteActionsParams {
  renameDialog: UseDialogStateReturn<RenameDialogData>;
  deleteDialog: UseDialogStateReturn<DeleteDialogData>;
  renameTable: (normalizedName: SavedTableTarget, newName: string) => Promise<SaveTableResult>;
  deleteTable: (normalizedName: SavedTableTarget) => Promise<SaveTableResult>;
  showToast: (message: string) => void;
  renameSavedTableDraft?: (
    fromNormalizedName: SavedTableTarget,
    toNormalizedName: string,
    nextTableName: string,
  ) => void;
  removeSavedTableDraft?: (normalizedName: SavedTableTarget) => void;
  onTabRename?: (
    fromNormalizedName: SavedTableTarget,
    toNormalizedName: string,
    newTitle: string,
  ) => void;
  onTabRemove?: (normalizedName: SavedTableTarget) => void;
}

export function useRenameDeleteActions({
  renameDialog,
  deleteDialog,
  renameTable,
  deleteTable,
  showToast,
  renameSavedTableDraft,
  removeSavedTableDraft,
  onTabRename,
  onTabRemove,
}: UseRenameDeleteActionsParams) {
  const { t } = useTranslation();
  const renameName = renameDialog.data.name;
  const renameTarget = renameDialog.data.target;
  const deleteTarget = deleteDialog.data.target;

  const handleOpenRenameDialog = useCallback(
    (item: SavedTableSummary) => {
      renameDialog.openDialog({
        name: item.name,
        target: item,
      });
    },
    [renameDialog],
  );

  const handleRenameDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        renameDialog.closeDialog();
      }
    },
    [renameDialog],
  );

  const handleConfirmRename = useCallback(async () => {
    if (!renameTarget) return;
    const result = await renameTable(renameTarget, renameName);
    if (!result.ok) {
      if (result.reason === 'duplicate') {
        renameDialog.setError(t('savedTables.toast.nameExists'));
        return;
      }
      showToast(result.message ?? t('savedTables.toast.renameFailed'));
      return;
    }
    const displayName = renameName.trim() || DEFAULT_SAVED_TABLE_NAME;
    showToast(t('savedTables.toast.tableRenamed', { name: displayName }));
    renameSavedTableDraft?.(renameTarget, result.normalizedName, displayName);
    onTabRename?.(renameTarget, result.normalizedName, displayName);
    renameDialog.closeDialog();
  }, [
    renameTarget,
    renameTable,
    renameName,
    renameDialog,
    showToast,
    t,
    renameSavedTableDraft,
    onTabRename,
  ]);

  const handleOpenDeleteDialog = useCallback(
    (item: SavedTableSummary) => {
      deleteDialog.openDialog({ target: item });
    },
    [deleteDialog],
  );

  const handleDeleteDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        deleteDialog.closeDialog();
      }
    },
    [deleteDialog],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const result = await deleteTable(deleteTarget);
    if (!result.ok) {
      showToast(result.message ?? t('savedTables.toast.deleteFailed'));
    } else {
      removeSavedTableDraft?.(deleteTarget);
      showToast(t('savedTables.toast.tableTrashed', { name: deleteTarget.name }));
      onTabRemove?.(deleteTarget);
    }
    deleteDialog.closeDialog();
  }, [deleteTarget, deleteTable, showToast, removeSavedTableDraft, deleteDialog, onTabRemove, t]);

  return {
    handleOpenRenameDialog,
    handleRenameDialogOpenChange,
    handleConfirmRename,
    handleOpenDeleteDialog,
    handleDeleteDialogOpenChange,
    handleConfirmDelete,
  };
}
