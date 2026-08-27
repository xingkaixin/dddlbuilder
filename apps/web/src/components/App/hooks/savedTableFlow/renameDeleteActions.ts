import { isSameSavedTable, type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { useCallback } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
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
  loadedTableSource: Extract<WorkspaceSelection, { kind: 'saved_table' }> | null;
  renameDialog: UseDialogStateReturn<RenameDialogData>;
  deleteDialog: UseDialogStateReturn<DeleteDialogData>;
  buildPersistedState: () => PersistedState;
  serializePersistedState: (state: PersistedState) => string;
  renameTable: (normalizedName: SavedTableTarget, newName: string) => Promise<SaveTableResult>;
  deleteTable: (normalizedName: SavedTableTarget) => Promise<SaveTableResult>;
  showToast: (message: string) => void;
  setWorkspaceSnapshot?: (source: WorkspaceSelection, state: PersistedState) => void;
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
  loadedTableSource,
  renameDialog,
  deleteDialog,
  buildPersistedState,
  serializePersistedState,
  renameTable,
  deleteTable,
  showToast,
  setWorkspaceSnapshot,
  renameSavedTableDraft,
  removeSavedTableDraft,
  onTabRename,
  onTabRemove,
}: UseRenameDeleteActionsParams) {
  const loadedTableSignature = loadedTableSource?.baseSignature ?? null;
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
        renameDialog.setError('名称已存在，请换一个');
        return;
      }
      showToast(result.message ?? '重命名失败');
      return;
    }
    const displayName = renameName.trim() || DEFAULT_SAVED_TABLE_NAME;
    showToast(`已重命名为：${displayName}`);
    renameSavedTableDraft?.(renameTarget, result.normalizedName, displayName);
    onTabRename?.(renameTarget, result.normalizedName, displayName);
    if (loadedTableSource && isSameSavedTable(renameTarget, loadedTableSource)) {
      const currentState = buildPersistedState();
      const nextSignature = loadedTableSignature ?? serializePersistedState(currentState);
      setWorkspaceSnapshot?.(
        {
          kind: 'saved_table',
          tableId: renameTarget.tableId,
          normalizedName: result.normalizedName,
          tableName: displayName,
          baseSignature: nextSignature,
        },
        currentState,
      );
    }
    renameDialog.closeDialog();
  }, [
    renameTarget,
    renameTable,
    renameName,
    renameDialog,
    showToast,
    loadedTableSource,
    loadedTableSignature,
    serializePersistedState,
    setWorkspaceSnapshot,
    buildPersistedState,
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
      showToast(result.message ?? '删除失败');
    } else {
      removeSavedTableDraft?.(deleteTarget);
      showToast(`已移入回收站：${deleteTarget.name}`);
      onTabRemove?.(deleteTarget);
    }
    deleteDialog.closeDialog();
  }, [deleteTarget, deleteTable, showToast, removeSavedTableDraft, deleteDialog, onTabRemove]);

  return {
    handleOpenRenameDialog,
    handleRenameDialogOpenChange,
    handleConfirmRename,
    handleOpenDeleteDialog,
    handleDeleteDialogOpenChange,
    handleConfirmDelete,
  };
}
