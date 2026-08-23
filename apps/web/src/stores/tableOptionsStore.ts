import {
  normalizeFillfactor,
  normalizeInitrans,
  normalizePctfree,
  normalizeTableMiscConfigNumbers,
  type TableMiscConfig,
} from '@ddlbuilder/shared-types';
import type { EditorSetState, TableOptionsSlice } from './editorStoreTypes';

export const DEFAULT_TABLE_MISC_CONFIG: TableMiscConfig = {
  enabled: false,
  engine: '',
  charset: '',
  collation: '',
  tablespace: '',
};

export const createTableOptionsSlice = (set: EditorSetState): TableOptionsSlice => ({
  tableMiscConfig: DEFAULT_TABLE_MISC_CONFIG,
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
  setFillfactor: (fillfactor) =>
    set((state) => ({
      tableMiscConfig: {
        ...state.tableMiscConfig,
        fillfactor: normalizeFillfactor(fillfactor),
      },
    })),
  setPctfree: (pctfree) =>
    set((state) => ({
      tableMiscConfig: {
        ...state.tableMiscConfig,
        pctfree: normalizePctfree(pctfree),
      },
    })),
  setInitrans: (initrans) =>
    set((state) => ({
      tableMiscConfig: {
        ...state.tableMiscConfig,
        initrans: normalizeInitrans(initrans),
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
    set((state) => {
      const partitions =
        typeof value === 'function'
          ? value(
              state.tableMiscConfig.partitions ?? {
                enabled: false,
                columns: [],
              },
            )
          : value;
      return {
        tableMiscConfig: normalizeTableMiscConfigNumbers({
          ...state.tableMiscConfig,
          partitions,
        }),
      };
    }),
  setTableMiscConfig: (value) =>
    set((state) => ({
      tableMiscConfig: normalizeTableMiscConfigNumbers(
        typeof value === 'function' ? value(state.tableMiscConfig) : value,
      ),
    })),
  resetTableMiscConfig: () =>
    set({
      tableMiscConfig: DEFAULT_TABLE_MISC_CONFIG,
    }),
});
