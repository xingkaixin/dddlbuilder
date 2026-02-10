import { create } from 'zustand';
import type { TableMiscConfig } from '@/types';

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
  setMiscEnabled: (enabled: boolean) => void;
  setEngine: (engine: string) => void;
  setCharset: (charset: string) => void;
  setCollation: (collation: string) => void;
  setTablespace: (tablespace: string) => void;
  setTableMiscConfig: (value: Setter<TableMiscConfig>) => void;
  resetTableMiscConfig: () => void;
}

export const useTableOptionsStore = create<TableOptionsStoreState>((set) => ({
  tableMiscConfig: DEFAULT_CONFIG,
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
  setTableMiscConfig: (value) =>
    set((state) => ({
      tableMiscConfig:
        typeof value === 'function' ? value(state.tableMiscConfig) : value,
    })),
  resetTableMiscConfig: () =>
    set({
      tableMiscConfig: DEFAULT_CONFIG,
    }),
}));
