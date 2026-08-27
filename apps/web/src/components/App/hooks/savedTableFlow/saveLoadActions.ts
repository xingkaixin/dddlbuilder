import { type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { useCallback } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { SavedTableDraftRecord, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import type { SaveTableResult, SavedTableSummary } from '@/hooks/useSavedTables';
import type { UseDialogStateReturn } from '@/hooks/useDialogState';
import { DEFAULT_SAVED_TABLE_NAME } from '@/utils/savedTablesDb';
import { INITIAL_VERSION_MESSAGE_KEY } from '@/utils/tableVersions';
import { resolveSavedTableSnapshot } from '@/services/savedTableSnapshot';

type SaveDialogData = {
  name: string;
};

interface UseSaveLoadActionsParams {
  tableName: string;
  hasLoadedTable: boolean;
  canSaveCurrent: boolean;
  loadedTableSource: Extract<WorkspaceSelection, { kind: 'saved_table' }> | null;
  setLoadedTableVersion: (version: number, normalizedName?: SavedTableTarget) => void;
  saveDialog: UseDialogStateReturn<SaveDialogData>;
  buildPersistedState: () => PersistedState;
  serializePersistedState: (state: PersistedState) => string;
  loadTable: (normalizedName: SavedTableTarget) => Promise<{
    tableId?: string;
    normalizedName: string;
    name: string;
    state: PersistedState;
  } | null>;
  saveTable: (name: string, state: PersistedState) => Promise<SaveTableResult>;
  overwriteTable: (
    normalizedName: SavedTableTarget,
    state: PersistedState,
  ) => Promise<SaveTableResult>;
  countTableVersions: (normalizedName: SavedTableTarget) => Promise<number>;
  createTableVersion: (
    normalizedName: SavedTableTarget,
    state: PersistedState,
    message?: string,
  ) => Promise<unknown>;
  showToast: (message: string) => void;
  getSavedTableDraft?: (normalizedName: SavedTableTarget) => SavedTableDraftRecord | null;
  onSaveSuccess?: (payload: {
    tableId?: string;
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
  loadTable,
  saveTable,
  overwriteTable,
  countTableVersions,
  createTableVersion,
  showToast,
  getSavedTableDraft,
  onSaveSuccess,
  onTableLoadStateChange,
}: UseSaveLoadActionsParams) {
  const loadedTableName = loadedTableSource?.tableName ?? null;
  const saveName = saveDialog.data.name;

  const resolveSavedTable = useCallback(
    async (target: SavedTableSummary) => {
      onTableLoadStateChange?.(true);

      try {
        const record = await loadTable(target);
        if (!record) {
          showToast('未找到保存的表');
          return null;
        }

        const snapshot = resolveSavedTableSnapshot(record, getSavedTableDraft?.(record) ?? null);

        let versionCount = 0;
        try {
          versionCount = await countTableVersions(record);
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
    [loadTable, showToast, getSavedTableDraft, onTableLoadStateChange, countTableVersions],
  );

  const openSaveDialog = useCallback(() => {
    const defaultName = loadedTableName || tableName.trim() || DEFAULT_SAVED_TABLE_NAME;
    saveDialog.openDialog({ name: defaultName });
  }, [loadedTableName, tableName, saveDialog]);

  const handleConfirmSave = useCallback(async () => {
    if (!canSaveCurrent) {
      showToast('加载的表未修改，无法保存');
      return;
    }
    const nextState = buildPersistedState();
    const nextSignature = serializePersistedState(nextState);

    let savedNormalizedName = '';
    let savedTableId: string | undefined;
    let savedDisplayName = '';
    let saveMode: 'create' | 'update' = 'create';

    if (hasLoadedTable && loadedTableSource) {
      const result = await overwriteTable(loadedTableSource, nextState);
      if (!result.ok) {
        if (result.reason === 'not_found') {
          showToast('未找到保存的表');
          return;
        }
        showToast(result.message ?? '更新失败');
        return;
      }
      savedNormalizedName = result.normalizedName;
      savedTableId = result.tableId ?? loadedTableSource.tableId;
      savedDisplayName = loadedTableName ?? saveName;
      saveMode = 'update';
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
      savedTableId = result.tableId;
      savedDisplayName = displayName;
      saveMode = 'create';
      showToast(`已保存：${displayName}`);
    }
    saveDialog.closeDialog();

    try {
      if (saveMode === 'update' && savedNormalizedName) {
        await createTableVersion(
          { normalizedName: savedNormalizedName, tableId: savedTableId },
          nextState,
        );
        const versionCount = await countTableVersions({
          normalizedName: savedNormalizedName,
          tableId: savedTableId,
        });
        setLoadedTableVersion(versionCount > 0 ? versionCount : 1, {
          normalizedName: savedNormalizedName,
          tableId: savedTableId,
        });
      } else if (saveMode === 'create' && savedNormalizedName) {
        await createTableVersion(
          { normalizedName: savedNormalizedName, tableId: savedTableId },
          nextState,
          INITIAL_VERSION_MESSAGE_KEY,
        );
        setLoadedTableVersion(1, { normalizedName: savedNormalizedName, tableId: savedTableId });
      }
    } catch (versionError) {
      console.error('[saved-table] failed to create version', versionError);
    }

    await onSaveSuccess?.({
      normalizedName: savedNormalizedName,
      ...(savedTableId ? { tableId: savedTableId } : {}),
      displayName: savedDisplayName,
      baseSignature: nextSignature,
      mode: saveMode,
    });
  }, [
    canSaveCurrent,
    showToast,
    buildPersistedState,
    serializePersistedState,
    hasLoadedTable,
    loadedTableSource,
    overwriteTable,
    loadedTableName,
    saveName,
    setLoadedTableVersion,
    saveTable,
    saveDialog,
    onSaveSuccess,
    countTableVersions,
    createTableVersion,
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
    openSaveDialog();
  }, [openSaveDialog]);

  return {
    handleOpenSaveDialog,
    handleConfirmSave,
    handleSaveDialogOpenChange,
    resolveSavedTable,
  };
}
