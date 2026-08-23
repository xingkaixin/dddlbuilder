import { useCallback } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { SavedTableDraftRecord, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import type { SaveTableResult, SavedTableSummary } from '@/hooks/useSavedTables';
import type { UseDialogStateReturn } from '@/hooks/useDialogState';
import { DEFAULT_SAVED_TABLE_NAME } from '@/utils/savedTablesDb';
import { createVersion, countVersions, INITIAL_VERSION_MESSAGE_KEY } from '@/utils/tableVersions';
import { resolveSavedTableSnapshot } from '@/services/savedTableSnapshot';

type SaveDialogData = {
  name: string;
  queuedLoadAfterSave: SavedTableSummary | null;
};

interface UseSaveLoadActionsParams {
  tableName: string;
  hasLoadedTable: boolean;
  canSaveCurrent: boolean;
  loadedTableSource: Extract<WorkspaceSelection, { kind: 'saved_table' }> | null;
  setLoadedTableVersion: (version: number, normalizedName?: string) => void;
  saveDialog: UseDialogStateReturn<SaveDialogData>;
  buildPersistedState: () => PersistedState;
  serializePersistedState: (state: PersistedState) => string;
  applySavedState: (state: PersistedState) => void;
  loadTable: (normalizedName: string) => Promise<{
    normalizedName: string;
    name: string;
    state: PersistedState;
  } | null>;
  saveTable: (name: string, state: PersistedState) => Promise<SaveTableResult>;
  overwriteTable: (normalizedName: string, state: PersistedState) => Promise<SaveTableResult>;
  showToast: (message: string) => void;
  getSavedTableDraft?: (normalizedName: string) => SavedTableDraftRecord | null;
  setWorkspaceSnapshot?: (source: WorkspaceSelection, state: PersistedState) => void;
  onSaveSuccess?: (payload: {
    normalizedName: string;
    displayName: string;
    baseSignature: string;
    mode: 'create' | 'update';
  }) => Promise<void> | void;
  onTableLoadStateChange?: (loading: boolean) => void;
}

export function useSaveLoadActions({
  tableName,
  hasLoadedTable,
  canSaveCurrent,
  loadedTableSource,
  setLoadedTableVersion,
  saveDialog,
  buildPersistedState,
  serializePersistedState,
  applySavedState,
  loadTable,
  saveTable,
  overwriteTable,
  showToast,
  getSavedTableDraft,
  setWorkspaceSnapshot,
  onSaveSuccess,
  onTableLoadStateChange,
}: UseSaveLoadActionsParams) {
  const loadedTableNormalizedName = loadedTableSource?.normalizedName ?? null;
  const loadedTableName = loadedTableSource?.tableName ?? null;
  const saveName = saveDialog.data.name;
  const queuedLoadAfterSave = saveDialog.data.queuedLoadAfterSave;

  const resolveSavedTable = useCallback(
    async (target: SavedTableSummary) => {
      onTableLoadStateChange?.(true);

      try {
        const record = await loadTable(target.normalizedName);
        if (!record) {
          showToast('未找到保存的表');
          return null;
        }

        const snapshot = resolveSavedTableSnapshot(
          record,
          getSavedTableDraft?.(record.normalizedName) ?? null,
        );

        let versionCount = 0;
        try {
          versionCount = await countVersions(record.normalizedName);
        } catch (error) {
          console.error('[saved-table] failed to count versions', error);
        }
        const resolvedVersion = versionCount > 0 ? versionCount : 1;

        return { ...snapshot, version: resolvedVersion };
      } catch (error) {
        showToast(error instanceof Error ? error.message : '加载失败');
        return null;
      } finally {
        onTableLoadStateChange?.(false);
      }
    },
    [loadTable, showToast, getSavedTableDraft, onTableLoadStateChange],
  );

  const handleLoadSavedTable = useCallback(
    async (target: SavedTableSummary) => {
      const snapshot = await resolveSavedTable(target);
      if (!snapshot) return null;

      setWorkspaceSnapshot?.(snapshot.source, snapshot.state);
      applySavedState(snapshot.state);
      setLoadedTableVersion(snapshot.version, snapshot.source.normalizedName);
      showToast(`已加载：${snapshot.source.tableName} (v${snapshot.version})`);
      return snapshot;
    },
    [applySavedState, resolveSavedTable, setLoadedTableVersion, setWorkspaceSnapshot, showToast],
  );

  const openSaveDialog = useCallback(
    (queuedLoad?: SavedTableSummary | null) => {
      const defaultName = loadedTableName || tableName.trim() || DEFAULT_SAVED_TABLE_NAME;
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
      savedNormalizedName = loadedTableNormalizedName;
      savedDisplayName = loadedTableName ?? saveName;
      saveMode = 'update';
      setWorkspaceSnapshot?.(
        {
          kind: 'saved_table',
          normalizedName: loadedTableNormalizedName,
          tableName: loadedTableName ?? saveName,
          baseSignature: nextSignature,
        },
        nextState,
      );
      showToast(`已更新：${loadedTableName ?? saveName}`);
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
      savedNormalizedName = normalizedName;
      savedDisplayName = displayName;
      saveMode = 'create';
      setWorkspaceSnapshot?.(
        {
          kind: 'saved_table',
          normalizedName,
          tableName: displayName,
          baseSignature: nextSignature,
        },
        nextState,
      );
      showToast(`已保存：${displayName}`);
    }
    saveDialog.closeDialog();

    try {
      if (saveMode === 'update' && savedNormalizedName) {
        await createVersion(savedNormalizedName, nextState);
        const versionCount = await countVersions(savedNormalizedName);
        setLoadedTableVersion(versionCount > 0 ? versionCount : 1);
      } else if (saveMode === 'create' && savedNormalizedName) {
        await createVersion(savedNormalizedName, nextState, INITIAL_VERSION_MESSAGE_KEY);
        setLoadedTableVersion(1);
      }
    } catch (versionError) {
      console.error('[saved-table] failed to create version', versionError);
    }

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
    setWorkspaceSnapshot,
    loadedTableName,
    saveName,
    setLoadedTableVersion,
    saveTable,
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

  const handleOpenSaveDialog = useCallback(() => {
    openSaveDialog(null);
  }, [openSaveDialog]);

  return {
    handleOpenSaveDialog,
    handleConfirmSave,
    handleSaveDialogOpenChange,
    handleLoadSavedTable,
    resolveSavedTable,
  };
}
