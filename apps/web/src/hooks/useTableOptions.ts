import { useEffect } from 'react';
import type {
  PersistedState,
  TableMiscConfig,
  HivePartitionConfig,
} from '@ddlbuilder/shared-types';
import { useTableOptionsStore } from '@/stores';

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
  setTableMiscConfig: React.Dispatch<React.SetStateAction<TableMiscConfig>>;
  resetTableMiscConfig: () => void;
}

export function useTableOptions(
  persistedState?: Pick<PersistedState, 'tableMiscConfig'>,
): UseTableOptionsReturn {
  const tableMiscConfig = useTableOptionsStore((state) => state.tableMiscConfig);
  const setMiscEnabled = useTableOptionsStore((state) => state.setMiscEnabled);
  const setEngine = useTableOptionsStore((state) => state.setEngine);
  const setCharset = useTableOptionsStore((state) => state.setCharset);
  const setCollation = useTableOptionsStore((state) => state.setCollation);
  const setTablespace = useTableOptionsStore((state) => state.setTablespace);
  const setFillfactor = useTableOptionsStore((state) => state.setFillfactor);
  const setPctfree = useTableOptionsStore((state) => state.setPctfree);
  const setInitrans = useTableOptionsStore((state) => state.setInitrans);
  const setStoredAs = useTableOptionsStore((state) => state.setStoredAs);
  const setExternal = useTableOptionsStore((state) => state.setExternal);
  const setLocation = useTableOptionsStore((state) => state.setLocation);
  const setHivePartitionConfig = useTableOptionsStore((state) => state.setHivePartitionConfig);
  const setTableMiscConfig = useTableOptionsStore((state) => state.setTableMiscConfig);
  const hydratedFromPersisted = useTableOptionsStore((state) => state.hydratedFromPersisted);
  const markHydratedFromPersisted = useTableOptionsStore(
    (state) => state.markHydratedFromPersisted,
  );
  const resetTableMiscConfig = useTableOptionsStore((state) => state.resetTableMiscConfig);

  useEffect(() => {
    if (!persistedState?.tableMiscConfig || hydratedFromPersisted) return;
    setTableMiscConfig((prev) => ({
      ...prev,
      ...persistedState.tableMiscConfig,
    }));
    markHydratedFromPersisted();
  }, [hydratedFromPersisted, markHydratedFromPersisted, persistedState, setTableMiscConfig]);

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
    setTableMiscConfig,
    resetTableMiscConfig,
  };
}
