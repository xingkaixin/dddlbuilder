import { useEffect } from 'react';
import type { PersistedState } from '@/types';
import type { WorkspaceSavePayload, WorkspaceSource } from '@/types/workspace';
import { useDebouncedEffect } from '@/hooks/useDebouncedEffect';

const PERSIST_DEBOUNCE_MS = 500;

interface UsePersistedSyncParams {
  hydrated: boolean;
  persistedState: Partial<PersistedState> | null;
  activeSource: WorkspaceSource;
  saveState: (payload: WorkspaceSavePayload) => void;
  buildPersistedState: () => PersistedState;
  setTableName: (name: string) => void;
  setTableComment: (comment: string) => void;
  setDbType: (dbType: PersistedState['dbType']) => void;
  setAddCount: (count: number) => void;
  initializeRows: (rows: PersistedState['rows']) => void;
  initializeIndexState: (persistedState?: {
    indexInput?: PersistedState['indexInput'];
    currentIndexFields?: PersistedState['currentIndexFields'];
    indexes?: PersistedState['indexes'];
  }) => void;
  setFieldTableFreezeEnabled: (enabled: boolean) => void;
  setFieldTableFreezeColumns: (columns: number) => void;
  defaultFieldTableFreezeColumns: number;
  setLoadedTableNormalizedName: (name: string | null) => void;
  setLoadedTableName: (name: string | null) => void;
  setLoadedTableSignature: (signature: string | null) => void;
}

export function usePersistedSync({
  hydrated,
  persistedState,
  activeSource,
  saveState,
  buildPersistedState,
  setTableName,
  setTableComment,
  setDbType,
  setAddCount,
  initializeRows,
  initializeIndexState,
  setFieldTableFreezeEnabled,
  setFieldTableFreezeColumns,
  defaultFieldTableFreezeColumns,
  setLoadedTableNormalizedName,
  setLoadedTableName,
  setLoadedTableSignature,
}: UsePersistedSyncParams) {
  useEffect(() => {
    if (!hydrated || !persistedState) return;

    if (typeof persistedState.tableName === 'string') {
      setTableName(persistedState.tableName);
    }
    if (typeof persistedState.tableComment === 'string') {
      setTableComment(persistedState.tableComment);
    }
    if (typeof persistedState.dbType === 'string') {
      setDbType(persistedState.dbType);
    }
    if (
      typeof persistedState.addCount === 'number' &&
      Number.isFinite(persistedState.addCount)
    ) {
      setAddCount(Math.max(1, Math.floor(persistedState.addCount)));
    }
    initializeRows(persistedState.rows ?? []);
    initializeIndexState(persistedState);

    const persistedFieldTableViewConfig = persistedState.fieldTableViewConfig;
    if (persistedFieldTableViewConfig) {
      setFieldTableFreezeEnabled(
        persistedFieldTableViewConfig.freezeEnabled !== false,
      );
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
    setTableName,
    setTableComment,
    setDbType,
    setAddCount,
    initializeRows,
    initializeIndexState,
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
      try {
        const state = buildPersistedState();
        const currentSignature = JSON.stringify(state);
        const source = activeSource;
        const isDirty =
          source.kind === 'saved_table'
            ? currentSignature !== source.baseSignature
            : false;
        saveState({
          state,
          source,
          isDirty,
        });
      } catch {
        // ignore quota errors
      }
    },
    [hydrated, buildPersistedState, activeSource, saveState],
    PERSIST_DEBOUNCE_MS,
  );
}
