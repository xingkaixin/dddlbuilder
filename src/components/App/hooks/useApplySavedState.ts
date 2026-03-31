import { useCallback } from 'react';
import type { PersistedState } from '@/types';

interface UseApplySavedStateParams {
  initialRows: PersistedState['rows'];
  defaultFieldTableFreezeEnabled: boolean;
  defaultFieldTableFreezeColumns: number;
  setRows: (rows: PersistedState['rows']) => void;
  setIndexes: (indexes: PersistedState['indexes']) => void;
  setIndexInput: (value: PersistedState['indexInput']) => void;
  setCurrentIndexFields: (fields: PersistedState['currentIndexFields']) => void;
  setAuthObjects: (objects: PersistedState['authObjects']) => void;
  setAuthInput: (input: PersistedState['authInput']) => void;
  setCitusShardingConfig: (config: NonNullable<PersistedState['citusShardingConfig']>) => void;
  resetCitusSharding: () => void;
  setMysqlPartitionConfig: (config: NonNullable<PersistedState['mysqlPartitionConfig']>) => void;
  resetPartition: () => void;
  setTableMiscConfig: (config: NonNullable<PersistedState['tableMiscConfig']>) => void;
  resetTableMiscConfig: () => void;
  setTableName: (name: string) => void;
  setTableComment: (comment: string) => void;
  setDbType: (dbType: PersistedState['dbType']) => void;
  setAddCount: (count: number) => void;
  setFieldTableFreezeEnabled: (enabled: boolean) => void;
  setFieldTableFreezeColumns: (columns: number) => void;
}

export function useApplySavedState({
  initialRows,
  defaultFieldTableFreezeEnabled,
  defaultFieldTableFreezeColumns,
  setRows,
  setIndexes,
  setIndexInput,
  setCurrentIndexFields,
  setAuthObjects,
  setAuthInput,
  setCitusShardingConfig,
  resetCitusSharding,
  setMysqlPartitionConfig,
  resetPartition,
  setTableMiscConfig,
  resetTableMiscConfig,
  setTableName,
  setTableComment,
  setDbType,
  setAddCount,
  setFieldTableFreezeEnabled,
  setFieldTableFreezeColumns,
}: UseApplySavedStateParams) {
  return useCallback(
    (state: PersistedState) => {
      setTableName(state.tableName ?? '');
      setTableComment(state.tableComment ?? '');
      setDbType(state.dbType ?? 'mysql');

      if (typeof state.addCount === 'number' && Number.isFinite(state.addCount)) {
        setAddCount(Math.max(1, Math.floor(state.addCount)));
      } else {
        setAddCount(10);
      }

      setRows(state.rows ?? initialRows);
      setIndexes(state.indexes ?? []);
      setIndexInput(state.indexInput ?? '');
      setCurrentIndexFields(state.currentIndexFields ?? []);
      setAuthObjects(state.authObjects ?? []);
      setAuthInput(state.authInput ?? '');

      if (state.citusShardingConfig) {
        setCitusShardingConfig(state.citusShardingConfig);
      } else {
        resetCitusSharding();
      }

      if (state.mysqlPartitionConfig) {
        setMysqlPartitionConfig(state.mysqlPartitionConfig);
      } else {
        resetPartition();
      }

      if (state.tableMiscConfig) {
        setTableMiscConfig(state.tableMiscConfig);
      } else {
        resetTableMiscConfig();
      }

      if (state.fieldTableViewConfig) {
        setFieldTableFreezeEnabled(state.fieldTableViewConfig.freezeEnabled);
        const freezeColumns = state.fieldTableViewConfig.freezeColumns;
        setFieldTableFreezeColumns(
          typeof freezeColumns === 'number' && Number.isFinite(freezeColumns)
            ? Math.max(1, Math.floor(freezeColumns))
            : defaultFieldTableFreezeColumns,
        );
      } else {
        setFieldTableFreezeEnabled(defaultFieldTableFreezeEnabled);
        setFieldTableFreezeColumns(defaultFieldTableFreezeColumns);
      }
    },
    [
      setRows,
      initialRows,
      setIndexes,
      setIndexInput,
      setCurrentIndexFields,
      setAuthObjects,
      setAuthInput,
      setCitusShardingConfig,
      resetCitusSharding,
      setMysqlPartitionConfig,
      resetPartition,
      setTableMiscConfig,
      resetTableMiscConfig,
      setTableName,
      setTableComment,
      setDbType,
      setAddCount,
      setFieldTableFreezeEnabled,
      setFieldTableFreezeColumns,
      defaultFieldTableFreezeColumns,
      defaultFieldTableFreezeEnabled,
    ],
  );
}
