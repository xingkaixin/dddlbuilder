import { useEffect } from 'react';
import type { PersistedState } from '@/types';
import { useDebouncedEffect } from '@/hooks/useDebouncedEffect';

const PERSIST_DEBOUNCE_MS = 500;

interface UsePersistedSyncParams {
  hydrated: boolean;
  persistedState: PersistedState | null;
  saveState: (state: PersistedState) => void;
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
}

export function usePersistedSync({
  hydrated,
  persistedState,
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
}: UsePersistedSyncParams) {
  useEffect(() => {
    if (!hydrated || !persistedState) return;

    if (typeof persistedState.tableName === 'string') {
      setTableName(persistedState.tableName);
    }
    if (typeof persistedState.tableComment === 'string') {
      setTableComment(persistedState.tableComment);
    }
    if (
      persistedState.dbType === 'mysql' ||
      persistedState.dbType === 'postgresql' ||
      persistedState.dbType === 'postgresql-citus' ||
      persistedState.dbType === 'sqlserver' ||
      persistedState.dbType === 'oracle'
    ) {
      setDbType(persistedState.dbType);
    }
    if (
      typeof persistedState.addCount === 'number' &&
      Number.isFinite(persistedState.addCount)
    ) {
      setAddCount(Math.max(1, Math.floor(persistedState.addCount)));
    }
    initializeRows(persistedState.rows);
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
  }, [
    hydrated,
    persistedState,
    setTableName,
    setTableComment,
    setDbType,
    setAddCount,
    initializeRows,
    initializeIndexState,
    setFieldTableFreezeEnabled,
    setFieldTableFreezeColumns,
    defaultFieldTableFreezeColumns,
  ]);

  useDebouncedEffect(
    () => {
      if (!hydrated) return;
      try {
        const payload = buildPersistedState();
        saveState(payload);
      } catch {
        // ignore quota errors
      }
    },
    [hydrated, buildPersistedState, saveState],
    PERSIST_DEBOUNCE_MS,
  );
}
