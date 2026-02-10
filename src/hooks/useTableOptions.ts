import { useEffect, useRef } from 'react';
import type { PersistedState, TableMiscConfig } from '@/types';
import { useTableOptionsStore } from '@/stores';

export interface UseTableOptionsReturn {
  tableMiscConfig: TableMiscConfig;
  setMiscEnabled: (enabled: boolean) => void;
  setEngine: (engine: string) => void;
  setCharset: (charset: string) => void;
  setCollation: (collation: string) => void;
  setTablespace: (tablespace: string) => void;
  setTableMiscConfig: React.Dispatch<React.SetStateAction<TableMiscConfig>>;
  resetTableMiscConfig: () => void;
}

export function useTableOptions(
  persistedState?: Pick<PersistedState, 'tableMiscConfig'>,
): UseTableOptionsReturn {
  const tableMiscConfig = useTableOptionsStore(
    (state) => state.tableMiscConfig,
  );
  const setMiscEnabled = useTableOptionsStore((state) => state.setMiscEnabled);
  const setEngine = useTableOptionsStore((state) => state.setEngine);
  const setCharset = useTableOptionsStore((state) => state.setCharset);
  const setCollation = useTableOptionsStore((state) => state.setCollation);
  const setTablespace = useTableOptionsStore((state) => state.setTablespace);
  const setTableMiscConfig = useTableOptionsStore(
    (state) => state.setTableMiscConfig,
  );
  const resetTableMiscConfig = useTableOptionsStore(
    (state) => state.resetTableMiscConfig,
  );
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!persistedState?.tableMiscConfig || initializedRef.current) return;
    setTableMiscConfig((prev) => ({
      ...prev,
      ...persistedState.tableMiscConfig,
    }));
    initializedRef.current = true;
  }, [persistedState, setTableMiscConfig]);

  return {
    tableMiscConfig,
    setMiscEnabled,
    setEngine,
    setCharset,
    setCollation,
    setTablespace,
    setTableMiscConfig,
    resetTableMiscConfig,
  };
}
