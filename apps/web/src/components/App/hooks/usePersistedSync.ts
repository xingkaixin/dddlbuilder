import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSavePayload, WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import { useDebouncedEffect } from '@/hooks/useDebouncedEffect';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';

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
}: UsePersistedSyncParams) {
  const activeSourceRef = useRef(activeSource);
  activeSourceRef.current = activeSource;
  const buildPersistedStateRef = useRef(buildPersistedState);
  buildPersistedStateRef.current = buildPersistedState;
  const browserOfflineRef = useRef(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const latestSaveInputsRef = useRef({
    hydrated,
    hasOpenTab,
    loadedTableNormalizedName,
    persistedState,
    saveState,
    updateActiveTabSnapshot,
  });
  latestSaveInputsRef.current = {
    hydrated,
    hasOpenTab,
    loadedTableNormalizedName,
    persistedState,
    saveState,
    updateActiveTabSnapshot,
  };
  const lastAppliedBuildPersistedStateRef = useRef<(() => PersistedState) | null>(null);
  const lastSavedBuildPersistedStateRef = useRef<(() => PersistedState) | null>(null);

  const saveCurrentState = useCallback(() => {
    const {
      hydrated: latestHydrated,
      hasOpenTab: latestHasOpenTab,
      loadedTableNormalizedName: latestLoadedTableNormalizedName,
      saveState: latestSaveState,
      updateActiveTabSnapshot: latestUpdateActiveTabSnapshot,
    } = latestSaveInputsRef.current;
    if (!latestHydrated) return;
    if (!latestHasOpenTab) return;
    const source = activeSourceRef.current;
    if (!source) return;
    if (lastSavedBuildPersistedStateRef.current === buildPersistedStateRef.current) return;
    const lastAppliedBuildPersistedState = lastAppliedBuildPersistedStateRef.current;
    if (lastAppliedBuildPersistedState) {
      if (lastAppliedBuildPersistedState === buildPersistedStateRef.current) {
        return;
      }
      lastAppliedBuildPersistedStateRef.current = null;
    }

    if (source.kind === 'saved_table') {
      if (source.normalizedName !== latestLoadedTableNormalizedName) {
        return;
      }
    } else if (latestLoadedTableNormalizedName != null) {
      return;
    }

    try {
      const state = buildPersistedStateRef.current();
      const currentSignature = serializePersistedStateForComparison(state);
      const isDirty =
        source.kind === 'saved_table' ? currentSignature !== source.baseSignature : false;
      latestSaveState({
        state,
        source,
        isDirty,
      });
      latestUpdateActiveTabSnapshot?.(state, isDirty);
      lastSavedBuildPersistedStateRef.current = buildPersistedStateRef.current;
    } catch {
      // ignore quota errors
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !persistedState) return;
    lastAppliedBuildPersistedStateRef.current = buildPersistedStateRef.current;

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

  useEffect(() => {
    if (!hydrated || !hasOpenTab) return;
    if (!lastAppliedBuildPersistedStateRef.current) return;
    if (lastAppliedBuildPersistedStateRef.current === buildPersistedState) return;
    lastAppliedBuildPersistedStateRef.current = null;
    const appliedState = latestSaveInputsRef.current.persistedState;
    if (
      appliedState?.rows &&
      serializePersistedStateForComparison(appliedState as PersistedState) ===
        serializePersistedStateForComparison(buildPersistedState())
    ) {
      lastSavedBuildPersistedStateRef.current = buildPersistedState;
    }
  }, [buildPersistedState, hasOpenTab, hydrated]);

  useEffect(() => {
    if (lastSavedBuildPersistedStateRef.current === buildPersistedState) return;
    lastSavedBuildPersistedStateRef.current = null;
  }, [buildPersistedState]);

  useLayoutEffect(() => {
    if (browserOfflineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      saveCurrentState();
    }
  }, [buildPersistedState, saveCurrentState]);

  useDebouncedEffect(
    () => {
      saveCurrentState();
    },
    [
      hydrated,
      hasOpenTab,
      buildPersistedState,
      saveState,
      loadedTableNormalizedName,
      updateActiveTabSnapshot,
      saveCurrentState,
    ],
    PERSIST_DEBOUNCE_MS,
  );

  useEffect(() => {
    const handleOnline = () => {
      saveCurrentState();
      browserOfflineRef.current = false;
    };
    const handleOffline = () => {
      browserOfflineRef.current = true;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentState();
      }
    };
    const handleFieldRowsCommitted = () => {
      window.setTimeout(saveCurrentState, 50);
    };
    window.addEventListener('online', handleOnline, { capture: true });
    window.addEventListener('offline', handleOffline);
    window.addEventListener('blur', saveCurrentState);
    window.addEventListener('pagehide', saveCurrentState);
    window.addEventListener('ddlbuilder:field-rows-committed', handleFieldRowsCommitted);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('online', handleOnline, true);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('blur', saveCurrentState);
      window.removeEventListener('pagehide', saveCurrentState);
      window.removeEventListener('ddlbuilder:field-rows-committed', handleFieldRowsCommitted);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveCurrentState]);
}
