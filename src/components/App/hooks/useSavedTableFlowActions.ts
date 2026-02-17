import { useCallback } from 'react';
import type { PersistedState } from '@/types';
import type { WorkspaceSource } from '@/types/workspace';
import type {
  SaveTableResult,
  SavedTableSummary,
} from '@/hooks/useSavedTables';
import type { UseDialogStateReturn } from '@/hooks/useDialogState';
import { DEFAULT_SAVED_TABLE_NAME } from '@/utils/savedTablesDb';
import { createVersion, countVersions } from '@/utils/tableVersions';

type AnalyticsValue = string | number | boolean | null | undefined;

type SaveDialogData = {
  name: string;
  queuedLoadAfterSave: SavedTableSummary | null;
};

type LoadConfirmDialogData = {
  pendingTarget: SavedTableSummary | null;
};

type RenameDialogData = {
  name: string;
  target: SavedTableSummary | null;
};

type DeleteDialogData = {
  target: SavedTableSummary | null;
};

interface UseSavedTableFlowActionsParams {
  tableName: string;
  hasLoadedTable: boolean;
  isLoadedDirty: boolean;
  canSaveCurrent: boolean;
  loadedTableNormalizedName: string | null;
  loadedTableName: string | null;
  loadedTableSignature: string | null;
  setLoadedTableNormalizedName: (value: string | null) => void;
  setLoadedTableName: (value: string | null) => void;
  setLoadedTableSignature: (value: string | null) => void;
  setLoadedTableVersion: (version: number) => void;
  setSavedTablesDrawerOpen: (open: boolean) => void;
  saveDialog: UseDialogStateReturn<SaveDialogData>;
  loadConfirmDialog: UseDialogStateReturn<LoadConfirmDialogData>;
  renameDialog: UseDialogStateReturn<RenameDialogData>;
  deleteDialog: UseDialogStateReturn<DeleteDialogData>;
  buildPersistedState: () => PersistedState;
  serializePersistedState: (state: PersistedState) => string;
  applySavedState: (state: PersistedState) => void;
  loadTable: (normalizedName: string) => Promise<{
    normalizedName: string;
    name: string;
    state: PersistedState;
  } | null>;
  renameTable: (
    normalizedName: string,
    newName: string,
  ) => Promise<SaveTableResult>;
  deleteTable: (normalizedName: string) => Promise<SaveTableResult>;
  saveTable: (name: string, state: PersistedState) => Promise<SaveTableResult>;
  overwriteTable: (
    normalizedName: string,
    state: PersistedState,
  ) => Promise<SaveTableResult>;
  showToast: (message: string) => void;
  trackEvent: (
    event: string,
    data?: Record<string, AnalyticsValue>,
  ) => Promise<void> | void;
  flushCurrentWorkspace?: () => void;
  getSavedTableDraft?: (normalizedName: string) => SavedTableDraftRecord | null;
  setWorkspaceSnapshot?: (
    source: WorkspaceSource,
    state: PersistedState | null,
  ) => void;
  renameSavedTableDraft?: (
    fromNormalizedName: string,
    toNormalizedName: string,
    nextTableName: string,
  ) => void;
  removeSavedTableDraft?: (normalizedName: string) => void;
  onSaveSuccess?: (payload: {
    normalizedName: string;
    displayName: string;
    baseSignature: string;
    mode: 'create' | 'update';
  }) => Promise<void> | void;
}

export function useSavedTableFlowActions({
  tableName,
  hasLoadedTable,
  isLoadedDirty,
  canSaveCurrent,
  loadedTableNormalizedName,
  loadedTableName,
  loadedTableSignature,
  setLoadedTableNormalizedName,
  setLoadedTableName,
  setLoadedTableSignature,
  setLoadedTableVersion,
  setSavedTablesDrawerOpen,
  saveDialog,
  loadConfirmDialog,
  renameDialog,
  deleteDialog,
  buildPersistedState,
  serializePersistedState,
  applySavedState,
  loadTable,
  renameTable,
  deleteTable,
  saveTable,
  overwriteTable,
  showToast,
  trackEvent,
  flushCurrentWorkspace,
  getSavedTableDraft,
  setWorkspaceSnapshot,
  renameSavedTableDraft,
  removeSavedTableDraft,
  onSaveSuccess,
}: UseSavedTableFlowActionsParams) {
  const saveName = saveDialog.data.name;
  const queuedLoadAfterSave = saveDialog.data.queuedLoadAfterSave;
  const pendingLoadTarget = loadConfirmDialog.data.pendingTarget;
  const renameName = renameDialog.data.name;
  const renameTarget = renameDialog.data.target;
  const deleteTarget = deleteDialog.data.target;

  const handleLoadSavedTable = useCallback(
    async (target: SavedTableSummary) => {
      console.log('[DEBUG] 加载已保存的表 - 开始:', {
        targetName: target.name,
        targetNormalizedName: target.normalizedName,
      });

      try {
        const record = await loadTable(target.normalizedName);
        if (!record) {
          showToast('未找到保存的表');
          return;
        }

        console.log('[DEBUG] 加载已保存的表 - 从数据库读取:', {
          normalizedName: record.normalizedName,
          name: record.name,
          savedTableSignature: record.state.tableName,
          dbType: record.state.dbType,
          fieldCount: record.state.rows.filter((r) => r.fieldName?.trim())
            .length,
        });

        const savedBaseSignature = serializePersistedState(record.state);

        // 获取版本数量以显示当前版本号
        let versionCount = 0;
        try {
          versionCount = await countVersions(record.normalizedName);
        } catch (e) {
          console.error('获取版本号失败', e);
        }
        const resolvedVersion = versionCount > 0 ? versionCount : 1;

        console.log('[DEBUG] 加载已保存的表 - 加载原始保存版本:', {
          source: {
            kind: 'saved_table',
            normalizedName: record.normalizedName,
            tableName: record.name,
            baseSignature: savedBaseSignature,
          },
          tableName: record.state.tableName,
          version: versionCount,
        });

        setWorkspaceSnapshot?.(
          {
            kind: 'saved_table',
            normalizedName: record.normalizedName,
            tableName: record.name,
            baseSignature: savedBaseSignature,
          },
          record.state,
        );
        applySavedState(record.state);
        setLoadedTableNormalizedName(record.normalizedName);
        setLoadedTableName(record.name);
        setLoadedTableSignature(savedBaseSignature);
        setLoadedTableVersion(resolvedVersion);
        trackEvent('table_load', { tableName: record.name });
        showToast(`已加载：${record.name} (v${resolvedVersion})`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : '加载失败');
      }
    },
    [
      loadTable,
      showToast,
      applySavedState,
      setLoadedTableNormalizedName,
      setLoadedTableName,
      setLoadedTableSignature,
      setLoadedTableVersion,
      serializePersistedState,
      setWorkspaceSnapshot,
      trackEvent,
    ],
  );

  const openSaveDialog = useCallback(
    (queuedLoad?: SavedTableSummary | null) => {
      const defaultName =
        loadedTableName || tableName.trim() || DEFAULT_SAVED_TABLE_NAME;
      saveDialog.openDialog({
        name: defaultName,
        queuedLoadAfterSave: queuedLoad ?? null,
      });
    },
    [loadedTableName, tableName, saveDialog],
  );

  const handleConfirmSave = useCallback(async () => {
    if (!canSaveCurrent) {
      showToast('加载的表未修改，无法保存');
      return;
    }
    const nextState = buildPersistedState();
    const nextSignature = serializePersistedState(nextState);

    let savedNormalizedName = '';
    let savedDisplayName = '';
    let saveMode: 'create' | 'update' = 'create';

    if (hasLoadedTable && loadedTableNormalizedName) {
      const result = await overwriteTable(loadedTableNormalizedName, nextState);
      if (!result.ok) {
        if (result.reason === 'not_found') {
          showToast('未找到保存的表');
          return;
        }
        showToast(result.message ?? '更新失败');
        return;
      }
      setLoadedTableSignature(nextSignature);
      setWorkspaceSnapshot?.(
        {
          kind: 'saved_table',
          normalizedName: loadedTableNormalizedName,
          tableName: loadedTableName ?? saveName,
          baseSignature: nextSignature,
        },
        nextState,
      );
      trackEvent('table_update', { tableName: loadedTableName });
      showToast(`已更新：${loadedTableName ?? saveName}`);
      await createVersion(loadedTableNormalizedName, nextState);
      const versionCount = await countVersions(loadedTableNormalizedName);
      setLoadedTableVersion(versionCount > 0 ? versionCount : 1);
      savedNormalizedName = loadedTableNormalizedName;
      savedDisplayName = loadedTableName ?? saveName;
      saveMode = 'update';
    } else {
      const result = await saveTable(saveName, nextState);
      if (!result.ok) {
        if (result.reason === 'duplicate') {
          saveDialog.setError('名称已存在，请换一个');
          return;
        }
        showToast(result.message ?? '保存失败');
        return;
      }
      const displayName = saveName.trim() || DEFAULT_SAVED_TABLE_NAME;
      const normalizedName = result.normalizedName;
      setLoadedTableNormalizedName(normalizedName);
      setLoadedTableName(displayName);
      setLoadedTableSignature(nextSignature);
      setWorkspaceSnapshot?.(
        {
          kind: 'saved_table',
          normalizedName,
          tableName: displayName,
          baseSignature: nextSignature,
        },
        nextState,
      );
      trackEvent('table_save', { tableName: displayName });
      showToast(`已保存：${displayName}`);
      await createVersion(normalizedName, nextState, '初始版本');
      setLoadedTableVersion(1);
      savedNormalizedName = normalizedName;
      savedDisplayName = displayName;
      saveMode = 'create';
    }
    saveDialog.closeDialog();

    if (onSaveSuccess) {
      await onSaveSuccess({
        normalizedName: savedNormalizedName,
        displayName: savedDisplayName,
        baseSignature: nextSignature,
        mode: saveMode,
      });
    }

    if (queuedLoadAfterSave) {
      await handleLoadSavedTable(queuedLoadAfterSave);
    }
  }, [
    canSaveCurrent,
    showToast,
    buildPersistedState,
    serializePersistedState,
    hasLoadedTable,
    loadedTableNormalizedName,
    overwriteTable,
    setLoadedTableSignature,
    setWorkspaceSnapshot,
    trackEvent,
    loadedTableName,
    saveName,
    setLoadedTableVersion,
    saveTable,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    saveDialog,
    onSaveSuccess,
    queuedLoadAfterSave,
    handleLoadSavedTable,
  ]);

  const handleSaveDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        saveDialog.closeDialog();
      }
    },
    [saveDialog],
  );

  const handleSelectSavedTable = useCallback(
    (item: SavedTableSummary) => {
      flushCurrentWorkspace?.();
      setSavedTablesDrawerOpen(false);
      if (hasLoadedTable && isLoadedDirty) {
        loadConfirmDialog.openDialog({ pendingTarget: item });
        return;
      }
      void handleLoadSavedTable(item);
    },
    [
      setSavedTablesDrawerOpen,
      flushCurrentWorkspace,
      hasLoadedTable,
      isLoadedDirty,
      loadConfirmDialog,
      handleLoadSavedTable,
    ],
  );

  const handleCancelLoadConfirm = useCallback(() => {
    loadConfirmDialog.closeDialog();
  }, [loadConfirmDialog]);

  const handleLoadConfirmOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        loadConfirmDialog.closeDialog();
      }
    },
    [loadConfirmDialog],
  );

  const handleConfirmLoadIgnore = useCallback(async () => {
    if (!pendingLoadTarget) return;
    loadConfirmDialog.closeDialog();
    await handleLoadSavedTable(pendingLoadTarget);
  }, [pendingLoadTarget, loadConfirmDialog, handleLoadSavedTable]);

  const handleConfirmLoadSave = useCallback(() => {
    if (!pendingLoadTarget) return;
    loadConfirmDialog.closeDialog();
    openSaveDialog(pendingLoadTarget);
  }, [pendingLoadTarget, loadConfirmDialog, openSaveDialog]);

  const handleOpenSaveDialog = useCallback(() => {
    openSaveDialog(null);
  }, [openSaveDialog]);

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
    trackEvent('table_rename', {
      oldName: renameTarget.name,
      newName: displayName,
    });
    showToast(`已重命名为：${displayName}`);
    renameSavedTableDraft?.(
      renameTarget.normalizedName,
      result.normalizedName,
      displayName,
    );
    if (
      loadedTableNormalizedName &&
      renameTarget.normalizedName === loadedTableNormalizedName
    ) {
      setLoadedTableNormalizedName(result.normalizedName);
      setLoadedTableName(displayName);
      const currentState = buildPersistedState();
      const nextSignature =
        loadedTableSignature ?? serializePersistedState(currentState);
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
      trackEvent('table_delete', { tableName: deleteTarget.name });
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
    handleOpenSaveDialog,
    handleConfirmSave,
    handleSaveDialogOpenChange,
    handleSelectSavedTable,
    handleCancelLoadConfirm,
    handleLoadConfirmOpenChange,
    handleConfirmLoadIgnore,
    handleConfirmLoadSave,
    handleOpenRenameDialog,
    handleRenameDialogOpenChange,
    handleConfirmRename,
    handleOpenDeleteDialog,
    handleDeleteDialogOpenChange,
    handleConfirmDelete,
  };
}
