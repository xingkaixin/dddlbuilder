import { useCallback } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import type { SaveTableResult, SavedTableSummary } from '@/hooks/useSavedTables';
import type { UseDialogStateReturn } from '@/hooks/useDialogState';
import { DEFAULT_SAVED_TABLE_NAME } from '@/utils/savedTablesDb';

type AnalyticsValue = string | number | boolean | null | undefined;

type RenameDialogData = {
  name: string;
  target: SavedTableSummary | null;
};

type DeleteDialogData = {
  target: SavedTableSummary | null;
};

interface UseRenameDeleteActionsParams {
  loadedTableNormalizedName: string | null;
  loadedTableSignature: string | null;
  setLoadedTableNormalizedName: (value: string | null) => void;
  setLoadedTableName: (value: string | null) => void;
  setLoadedTableSignature: (value: string | null) => void;
  renameDialog: UseDialogStateReturn<RenameDialogData>;
  deleteDialog: UseDialogStateReturn<DeleteDialogData>;
  buildPersistedState: () => PersistedState;
  serializePersistedState: (state: PersistedState) => string;
  renameTable: (normalizedName: string, newName: string) => Promise<SaveTableResult>;
  deleteTable: (normalizedName: string) => Promise<SaveTableResult>;
  showToast: (message: string) => void;
  trackEvent: (event: string, data?: Record<string, AnalyticsValue>) => Promise<void> | void;
  setWorkspaceSnapshot?: (source: WorkspaceSource, state: PersistedState | null) => void;
  renameSavedTableDraft?: (
    fromNormalizedName: string,
    toNormalizedName: string,
    nextTableName: string,
  ) => void;
  removeSavedTableDraft?: (normalizedName: string) => void;
}

export function useRenameDeleteActions({
  loadedTableNormalizedName,
  loadedTableSignature,
  setLoadedTableNormalizedName,
  setLoadedTableName,
  setLoadedTableSignature,
  renameDialog,
  deleteDialog,
  buildPersistedState,
  serializePersistedState,
  renameTable,
  deleteTable,
  showToast,
  trackEvent,
  setWorkspaceSnapshot,
  renameSavedTableDraft,
  removeSavedTableDraft,
}: UseRenameDeleteActionsParams) {
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
    const result = await renameTable(renameTarget.normalizedName, renameName);
    if (!result.ok) {
      if (result.reason === 'duplicate') {
        renameDialog.setError('名称已存在，请换一个');
        return;
      }
      showToast(result.message ?? '重命名失败');
      return;
    }
    const displayName = renameName.trim() || DEFAULT_SAVED_TABLE_NAME;
    void trackEvent('table_rename', {
      oldName: renameTarget.name,
      newName: displayName,
    });
    showToast(`已重命名为：${displayName}`);
    renameSavedTableDraft?.(renameTarget.normalizedName, result.normalizedName, displayName);
    if (loadedTableNormalizedName && renameTarget.normalizedName === loadedTableNormalizedName) {
      setLoadedTableNormalizedName(result.normalizedName);
      setLoadedTableName(displayName);
      const currentState = buildPersistedState();
      const nextSignature = loadedTableSignature ?? serializePersistedState(currentState);
      setWorkspaceSnapshot?.(
        {
          kind: 'saved_table',
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
    trackEvent,
    loadedTableNormalizedName,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    loadedTableSignature,
    serializePersistedState,
    setWorkspaceSnapshot,
    buildPersistedState,
    renameSavedTableDraft,
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
    const result = await deleteTable(deleteTarget.normalizedName);
    if (!result.ok) {
      showToast(result.message ?? '删除失败');
    } else {
      removeSavedTableDraft?.(deleteTarget.normalizedName);
      void trackEvent('table_delete', { tableName: deleteTarget.name });
      showToast(`已删除：${deleteTarget.name}`);
      if (deleteTarget.normalizedName === loadedTableNormalizedName) {
        setLoadedTableNormalizedName(null);
        setLoadedTableName(null);
        setLoadedTableSignature(null);
        setWorkspaceSnapshot?.({ kind: 'global_draft' }, buildPersistedState());
      }
    }
    deleteDialog.closeDialog();
  }, [
    deleteTarget,
    deleteTable,
    showToast,
    trackEvent,
    loadedTableNormalizedName,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    setLoadedTableSignature,
    setWorkspaceSnapshot,
    buildPersistedState,
    removeSavedTableDraft,
    deleteDialog,
  ]);

  return {
    handleOpenRenameDialog,
    handleRenameDialogOpenChange,
    handleConfirmRename,
    handleOpenDeleteDialog,
    handleDeleteDialogOpenChange,
    handleConfirmDelete,
  };
}
