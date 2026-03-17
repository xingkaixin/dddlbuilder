import { create } from 'zustand';
import type { TableMiscConfig, HivePartitionConfig } from '@/types';

type Setter<T> = T | ((prev: T) => T);

const DEFAULT_CONFIG: TableMiscConfig = {
  enabled: false,
  engine: '',
  charset: '',
  collation: '',
  tablespace: '',
};

interface TableOptionsStoreState {
  tableMiscConfig: TableMiscConfig;
  hydratedFromPersisted: boolean;
  setMiscEnabled: (enabled: boolean) => void;
  setEngine: (engine: string) => void;
  setCharset: (charset: string) => void;
  setCollation: (collation: string) => void;
  setTablespace: (tablespace: string) => void;
  setStoredAs: (value: TableMiscConfig['storedAs']) => void;
  setExternal: (value: boolean) => void;
  setLocation: (value: string) => void;
  setHivePartitionConfig: (value: Setter<HivePartitionConfig>) => void;
  setTableMiscConfig: (value: Setter<TableMiscConfig>) => void;
  markHydratedFromPersisted: () => void;
  resetTableMiscConfig: () => void;
}

export const useTableOptionsStore = create<TableOptionsStoreState>((set) => ({
  tableMiscConfig: DEFAULT_CONFIG,
  hydratedFromPersisted: false,
  setMiscEnabled: (enabled) =>
    set((state) => ({
      tableMiscConfig: {
        ...state.tableMiscConfig,
        enabled,
      },
    })),
  setEngine: (engine) =>
    set((state) => ({
      tableMiscConfig: {
        ...state.tableMiscConfig,
        engine,
      },
    })),
  setCharset: (charset) =>
    set((state) => ({
      tableMiscConfig: {
        ...state.tableMiscConfig,
        charset,
      },
    })),
  setCollation: (collation) =>
    set((state) => ({
      tableMiscConfig: {
        ...state.tableMiscConfig,
        collation,
      },
    })),
  setTablespace: (tablespace) =>
    set((state) => ({
      tableMiscConfig: {
        ...state.tableMiscConfig,
        tablespace,
      },
    })),
  setStoredAs: (value) =>
    set((state) => ({
      tableMiscConfig: {
        ...state.tableMiscConfig,
        storedAs: value,
      },
    })),
  setExternal: (value) =>
    set((state) => ({
      tableMiscConfig: {
        ...state.tableMiscConfig,
        external: value,
      },
    })),
  setLocation: (value) =>
    set((state) => ({
      tableMiscConfig: {
        ...state.tableMiscConfig,
        location: value,
      },
    })),
  setHivePartitionConfig: (value) =>
    set((state) => ({
      tableMiscConfig: {
        ...state.tableMiscConfig,
        partitions:
          typeof value === 'function'
            ? value(
                state.tableMiscConfig.partitions ?? {
                  enabled: false,
                  columns: [],
                },
              )
            : value,
      },
    })),
  setTableMiscConfig: (value) =>
    set((state) => ({
      tableMiscConfig:
        typeof value === 'function' ? value(state.tableMiscConfig) : value,
    })),
  markHydratedFromPersisted: () =>
    set({
      hydratedFromPersisted: true,
    }),
  resetTableMiscConfig: () =>
    set({
      tableMiscConfig: DEFAULT_CONFIG,
      hydratedFromPersisted: false,
    }),
}));
