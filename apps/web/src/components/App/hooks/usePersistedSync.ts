import { useEffect, useRef } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSavePayload, WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import { useDebouncedEffect } from '@/hooks/useDebouncedEffect';

const PERSIST_DEBOUNCE_MS = 500;

interface UsePersistedSyncParams {
  hydrated: boolean;
  hasOpenTab: boolean;
  persistedState: Partial<PersistedState> | null;
  activeSource: WorkspaceSource;
  saveState: (payload: WorkspaceSavePayload) => void;
  buildPersistedState: () => PersistedState;
  setSchemaName: (name: string) => void;
  setTableName: (name: string) => void;
  setTableComment: (comment: string) => void;
  setObjectType: (objectType: NonNullable<PersistedState['objectType']>) => void;
  setViewDefinition: (definition: string) => void;
  setViewCreateOrReplace: (enabled: boolean) => void;
  setDbType: (dbType: PersistedState['dbType']) => void;
  setSqlFormatMode: (mode: PersistedState['sqlFormatMode']) => void;
  setAddCount: (count: number) => void;
  initializeRows: (rows: PersistedState['rows']) => void;
  initializeIndexState: (persistedState?: {
    indexInput?: PersistedState['indexInput'];
    currentIndexFields?: PersistedState['currentIndexFields'];
    indexes?: PersistedState['indexes'];
  }) => void;
  initializeForeignKeyState: (persistedState?: {
    foreignKeys?: PersistedState['foreignKeys'];
  }) => void;
  setFieldTableFreezeEnabled: (enabled: boolean) => void;
  setFieldTableFreezeColumns: (columns: number) => void;
  defaultFieldTableFreezeColumns: number;
  setLoadedTableNormalizedName: (name: string | null) => void;
  setLoadedTableName: (name: string | null) => void;
  setLoadedTableSignature: (signature: string | null) => void;
  // 新增：用于一致性检查
  loadedTableNormalizedName: string | null;
  // 新增：同步更新标签页快照的 dirty 状态
  updateActiveTabSnapshot?: (state: PersistedState, isDirty: boolean) => void;
  activeTabSnapshot?: PersistedState | null;
}

export function usePersistedSync({
  hydrated,
  hasOpenTab,
  persistedState,
  activeSource,
  saveState,
  buildPersistedState,
  setSchemaName,
  setTableName,
  setTableComment,
  setObjectType,
  setViewDefinition,
  setViewCreateOrReplace,
  setDbType,
  setSqlFormatMode,
  setAddCount,
  initializeRows,
  initializeIndexState,
  initializeForeignKeyState,
  setFieldTableFreezeEnabled,
  setFieldTableFreezeColumns,
  defaultFieldTableFreezeColumns,
  setLoadedTableNormalizedName,
  setLoadedTableName,
  setLoadedTableSignature,
  loadedTableNormalizedName,
  updateActiveTabSnapshot,
  activeTabSnapshot,
}: UsePersistedSyncParams) {
  const activeSourceRef = useRef(activeSource);
  activeSourceRef.current = activeSource;
  const lastAppliedPersistedSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || !persistedState) return;
    lastAppliedPersistedSignatureRef.current = JSON.stringify(persistedState);

    if (typeof persistedState.schemaName === 'string') {
      setSchemaName(persistedState.schemaName);
    }
    if (typeof persistedState.tableName === 'string') {
      setTableName(persistedState.tableName);
    }
    if (typeof persistedState.tableComment === 'string') {
      setTableComment(persistedState.tableComment);
    }
    setObjectType(persistedState.objectType === 'view' ? 'view' : 'table');
    setViewDefinition(
      typeof persistedState.viewDefinition === 'string' ? persistedState.viewDefinition : '',
    );
    setViewCreateOrReplace(persistedState.viewCreateOrReplace !== false);
    if (typeof persistedState.dbType === 'string') {
      setDbType(persistedState.dbType);
    }
    if (persistedState.sqlFormatMode === 'aligned' || persistedState.sqlFormatMode === 'compact') {
      setSqlFormatMode(persistedState.sqlFormatMode);
    }
    if (typeof persistedState.addCount === 'number' && Number.isFinite(persistedState.addCount)) {
      setAddCount(Math.max(1, Math.floor(persistedState.addCount)));
    }
    initializeRows(persistedState.rows ?? []);
    initializeIndexState(persistedState);
    initializeForeignKeyState(persistedState);

    const persistedFieldTableViewConfig = persistedState.fieldTableViewConfig;
    if (persistedFieldTableViewConfig) {
      setFieldTableFreezeEnabled(persistedFieldTableViewConfig.freezeEnabled === true);
      const freezeColumns = persistedFieldTableViewConfig.freezeColumns;
      setFieldTableFreezeColumns(
        typeof freezeColumns === 'number' && Number.isFinite(freezeColumns)
          ? Math.max(1, Math.floor(freezeColumns))
          : defaultFieldTableFreezeColumns,
      );
    }

    if (activeSource.kind === 'saved_table') {
      setLoadedTableNormalizedName(activeSource.normalizedName);
      setLoadedTableName(activeSource.tableName);
      setLoadedTableSignature(activeSource.baseSignature);
    } else {
      setLoadedTableNormalizedName(null);
      setLoadedTableName(null);
      setLoadedTableSignature(null);
    }
  }, [
    hydrated,
    persistedState,
    activeSource,
    setSchemaName,
    setTableName,
    setTableComment,
    setObjectType,
    setViewDefinition,
    setViewCreateOrReplace,
    setDbType,
    setSqlFormatMode,
    setAddCount,
    initializeRows,
    initializeIndexState,
    initializeForeignKeyState,
    setFieldTableFreezeEnabled,
    setFieldTableFreezeColumns,
    defaultFieldTableFreezeColumns,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    setLoadedTableSignature,
  ]);

  useDebouncedEffect(
    () => {
      if (!hydrated) return;
      if (!hasOpenTab) return;
      const source = activeSourceRef.current;
      if (!source) return;

      // 一致性检查：防止因 State 与 Source 更新不同步导致的覆写
      // 当切换表时，如果 ActiveSource 已更新但 Store (loadedTableData) 尚未更新（或反之），
      // 此时保存会导致将 旧State 写入 新Source 或 新State 写入 旧Source。
      // 我们通过检查 activeSource 与 loadedTableNormalizedName 是否匹配来避免此情况。
      if (source.kind === 'saved_table') {
        if (source.normalizedName !== loadedTableNormalizedName) {
          // 不匹配，跳过保存
          return;
        }
      } else {
        // draft
        if (loadedTableNormalizedName != null) {
          // 不匹配，跳过保存
          return;
        }
      }

      try {
        const state = buildPersistedState();
        const currentSignature = JSON.stringify(state);
        const lastAppliedSignature = lastAppliedPersistedSignatureRef.current;
        if (lastAppliedSignature) {
          lastAppliedPersistedSignatureRef.current = null;
          if (currentSignature !== lastAppliedSignature) {
            return;
          }
        }
        if (activeTabSnapshot && currentSignature === JSON.stringify(activeTabSnapshot)) {
          return;
        }
        const isDirty =
          source.kind === 'saved_table' ? currentSignature !== source.baseSignature : false;
        saveState({
          state,
          source,
          isDirty,
        });
        updateActiveTabSnapshot?.(state, isDirty);
      } catch {
        // ignore quota errors
      }
    },
    [
      hydrated,
      hasOpenTab,
      buildPersistedState,
      saveState,
      loadedTableNormalizedName,
      updateActiveTabSnapshot,
      activeTabSnapshot,
    ],
    PERSIST_DEBOUNCE_MS,
  );
}
