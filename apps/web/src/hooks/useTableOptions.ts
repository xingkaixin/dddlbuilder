import { useCallback } from 'react';
import type { TableMiscConfig, HivePartitionConfig } from '@ddlbuilder/shared-types';
import { useEditorStore } from '@/stores';

export interface UseTableOptionsReturn {
  tableMiscConfig: TableMiscConfig;
  setMiscEnabled: (enabled: boolean) => void;
  setEngine: (engine: string) => void;
  setCharset: (charset: string) => void;
  setCollation: (collation: string) => void;
  setTablespace: (tablespace: string) => void;
  setFillfactor: (fillfactor: number | undefined) => void;
  setPctfree: (pctfree: number | undefined) => void;
  setInitrans: (initrans: number | undefined) => void;
  setStoredAs: (value: TableMiscConfig['storedAs']) => void;
  setExternal: (value: boolean) => void;
  setLocation: (value: string) => void;
  setHivePartitionConfig: React.Dispatch<React.SetStateAction<HivePartitionConfig>>;
  setHivePartitionEnabled: (enabled: boolean) => void;
  addHivePartitionColumn: (column: HivePartitionConfig['columns'][number]) => void;
  removeHivePartitionColumn: (index: number) => void;
  updateHivePartitionColumn: (
    index: number,
    column: HivePartitionConfig['columns'][number],
  ) => void;
  setHiveClustering: (clustering: HivePartitionConfig['clustering']) => void;
  setTableMiscConfig: React.Dispatch<React.SetStateAction<TableMiscConfig>>;
  resetTableMiscConfig: () => void;
}

export function useTableOptions(): UseTableOptionsReturn {
  const tableMiscConfig = useEditorStore((state) => state.tableMiscConfig);
  const setMiscEnabled = useEditorStore((state) => state.setMiscEnabled);
  const setEngine = useEditorStore((state) => state.setEngine);
  const setCharset = useEditorStore((state) => state.setCharset);
  const setCollation = useEditorStore((state) => state.setCollation);
  const setTablespace = useEditorStore((state) => state.setTablespace);
  const setFillfactor = useEditorStore((state) => state.setFillfactor);
  const setPctfree = useEditorStore((state) => state.setPctfree);
  const setInitrans = useEditorStore((state) => state.setInitrans);
  const setStoredAs = useEditorStore((state) => state.setStoredAs);
  const setExternal = useEditorStore((state) => state.setExternal);
  const setLocation = useEditorStore((state) => state.setLocation);
  const setHivePartitionConfig = useEditorStore((state) => state.setHivePartitionConfig);
  const setTableMiscConfig = useEditorStore((state) => state.setTableMiscConfig);
  const resetTableMiscConfig = useEditorStore((state) => state.resetTableMiscConfig);
  const setHivePartitionEnabled = useCallback(
    (enabled: boolean) => setHivePartitionConfig((previous) => ({ ...previous, enabled })),
    [setHivePartitionConfig],
  );
  const addHivePartitionColumn = useCallback(
    (column: HivePartitionConfig['columns'][number]) =>
      setHivePartitionConfig((previous) => ({
        ...previous,
        columns: [...previous.columns, column],
      })),
    [setHivePartitionConfig],
  );
  const removeHivePartitionColumn = useCallback(
    (index: number) =>
      setHivePartitionConfig((previous) => ({
        ...previous,
        columns: previous.columns.filter((_, columnIndex) => columnIndex !== index),
      })),
    [setHivePartitionConfig],
  );
  const updateHivePartitionColumn = useCallback(
    (index: number, column: HivePartitionConfig['columns'][number]) =>
      setHivePartitionConfig((previous) => ({
        ...previous,
        columns: previous.columns.map((current, columnIndex) =>
          columnIndex === index ? column : current,
        ),
      })),
    [setHivePartitionConfig],
  );
  const setHiveClustering = useCallback(
    (clustering: HivePartitionConfig['clustering']) =>
      setHivePartitionConfig((previous) => ({ ...previous, clustering })),
    [setHivePartitionConfig],
  );

  return {
    tableMiscConfig,
    setMiscEnabled,
    setEngine,
    setCharset,
    setCollation,
    setTablespace,
    setFillfactor,
    setPctfree,
    setInitrans,
    setStoredAs,
    setExternal,
    setLocation,
    setHivePartitionConfig,
    setHivePartitionEnabled,
    addHivePartitionColumn,
    removeHivePartitionColumn,
    updateHivePartitionColumn,
    setHiveClustering,
    setTableMiscConfig,
    resetTableMiscConfig,
  };
}
