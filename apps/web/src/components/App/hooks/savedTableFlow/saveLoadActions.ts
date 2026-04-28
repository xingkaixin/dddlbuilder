import { useCallback } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import type { SaveTableResult, SavedTableSummary } from '@/hooks/useSavedTables';
import type { UseDialogStateReturn } from '@/hooks/useDialogState';
import { DEFAULT_SAVED_TABLE_NAME } from '@/utils/savedTablesDb';
import { createVersion, countVersions, INITIAL_VERSION_MESSAGE_KEY } from '@/utils/tableVersions';

type AnalyticsValue = string | number | boolean | null | undefined;

type SaveDialogData = {
  name: string;
  queuedLoadAfterSave: SavedTableSummary | null;
};

interface UseSaveLoadActionsParams {
  tableName: string;
  hasLoadedTable: boolean;
  canSaveCurrent: boolean;
  loadedTableNormalizedName: string | null;
  loadedTableName: string | null;
  setLoadedTableNormalizedName: (value: string | null) => void;
  setLoadedTableName: (value: string | null) => void;
  setLoadedTableSignature: (value: string | null) => void;
  setLoadedTableVersion: (version: number) => void;
  setSavedTablesDrawerOpen: (open: boolean) => void;
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
  trackEvent: (event: string, data?: Record<string, AnalyticsValue>) => Promise<void> | void;
  flushCurrentWorkspace?: () => void;
  setWorkspaceSnapshot?: (source: WorkspaceSource, state: PersistedState | null) => void;
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
  loadedTableNormalizedName,
  loadedTableName,
  setLoadedTableNormalizedName,
  setLoadedTableName,
  setLoadedTableSignature,
  setLoadedTableVersion,
  setSavedTablesDrawerOpen,
  saveDialog,
  buildPersistedState,
  serializePersistedState,
  applySavedState,
  loadTable,
  saveTable,
  overwriteTable,
  showToast,
  trackEvent,
  flushCurrentWorkspace,
  setWorkspaceSnapshot,
  onSaveSuccess,
  onTableLoadStateChange,
}: UseSaveLoadActionsParams) {
  const saveName = saveDialog.data.name;
  const queuedLoadAfterSave = saveDialog.data.queuedLoadAfterSave;

  const handleLoadSavedTable = useCallback(
    async (target: SavedTableSummary) => {
      onTableLoadStateChange?.(true);
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
          fieldCount: record.state.rows.filter((r) => r.fieldName?.trim()).length,
        });

        const savedBaseSignature = serializePersistedState(record.state);

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
        void trackEvent('table_load', { tableName: record.name });
        showToast(`已加载：${record.name} (v${resolvedVersion})`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : '加载失败');
      } finally {
        onTableLoadStateChange?.(false);
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
      onTableLoadStateChange,
    ],
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
      void trackEvent('table_update', { tableName: loadedTableName });
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
      void trackEvent('table_save', { tableName: displayName });
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
      console.error('[DEBUG] 版本创建失败:', versionError);
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
      if (hasLoadedTable && canSaveCurrent) {
        openSaveDialog(item);
        return;
      }
      void handleLoadSavedTable(item);
    },
    [
      setSavedTablesDrawerOpen,
      flushCurrentWorkspace,
      hasLoadedTable,
      canSaveCurrent,
      openSaveDialog,
      handleLoadSavedTable,
    ],
  );

  const handleOpenSaveDialog = useCallback(() => {
    openSaveDialog(null);
  }, [openSaveDialog]);

  return {
    handleOpenSaveDialog,
    handleConfirmSave,
    handleSaveDialogOpenChange,
    handleSelectSavedTable,
  };
}
