import { useState, useCallback, useEffect } from 'react';
import type { PersistedState, TableMiscConfig } from '@/types';

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

const DEFAULT_CONFIG: TableMiscConfig = {
  enabled: false,
  engine: '',
  charset: '',
  collation: '',
  tablespace: '',
};

export function useTableOptions(
  persistedState?: Pick<PersistedState, 'tableMiscConfig'>,
): UseTableOptionsReturn {
  const [tableMiscConfig, setTableMiscConfig] =
    useState<TableMiscConfig>(DEFAULT_CONFIG);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (persistedState?.tableMiscConfig && !initialized) {
      setTableMiscConfig({
        ...DEFAULT_CONFIG,
        ...persistedState.tableMiscConfig,
      });
      setInitialized(true);
    }
  }, [persistedState, initialized]);

  const setMiscEnabled = useCallback((enabled: boolean) => {
    setTableMiscConfig((prev) => ({
      ...prev,
      enabled,
    }));
  }, []);

  const setEngine = useCallback((engine: string) => {
    setTableMiscConfig((prev) => ({
      ...prev,
      engine,
    }));
  }, []);

  const setCharset = useCallback((charset: string) => {
    setTableMiscConfig((prev) => ({
      ...prev,
      charset,
    }));
  }, []);

  const setCollation = useCallback((collation: string) => {
    setTableMiscConfig((prev) => ({
      ...prev,
      collation,
    }));
  }, []);

  const setTablespace = useCallback((tablespace: string) => {
    setTableMiscConfig((prev) => ({
      ...prev,
      tablespace,
    }));
  }, []);

  const resetTableMiscConfig = useCallback(() => {
    setTableMiscConfig(DEFAULT_CONFIG);
  }, []);

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
