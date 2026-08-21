import { beforeEach, describe, expect, it } from 'vitest';
import { useTableOptionsStore } from '@/stores';

function resetTableOptionsStore() {
  useTableOptionsStore.getState().resetTableMiscConfig();
}

describe('tableOptionsStore', () => {
  beforeEach(() => {
    resetTableOptionsStore();
  });

  it('应该更新并重置表级杂项配置', () => {
    const state = useTableOptionsStore.getState();

    state.setMiscEnabled(true);
    state.setEngine('InnoDB');
    state.setCharset('utf8mb4');
    state.setCollation('utf8mb4_general_ci');

    let current = useTableOptionsStore.getState();
    expect(current.tableMiscConfig.enabled).toBe(true);
    expect(current.tableMiscConfig.engine).toBe('InnoDB');
    expect(current.tableMiscConfig.charset).toBe('utf8mb4');
    expect(current.tableMiscConfig.collation).toBe('utf8mb4_general_ci');

    current.resetTableMiscConfig();
    current = useTableOptionsStore.getState();
    expect(current.tableMiscConfig).toEqual({
      enabled: false,
      engine: '',
      charset: '',
      collation: '',
      tablespace: '',
    });
  });

  it('应该支持直接设置和函数式 setTableMiscConfig', () => {
    const state = useTableOptionsStore.getState();

    state.setTableMiscConfig({
      enabled: true,
      engine: 'MyISAM',
      charset: 'latin1',
      collation: 'latin1_swedish_ci',
      tablespace: 'ts_direct',
    });

    let current = useTableOptionsStore.getState();
    expect(current.tableMiscConfig).toEqual({
      enabled: true,
      engine: 'MyISAM',
      charset: 'latin1',
      collation: 'latin1_swedish_ci',
      tablespace: 'ts_direct',
    });

    state.setTableMiscConfig((prev) => ({
      ...prev,
      enabled: false,
      tablespace: 'ts_func',
    }));

    current = useTableOptionsStore.getState();
    expect(current.tableMiscConfig.enabled).toBe(false);
    expect(current.tableMiscConfig.tablespace).toBe('ts_func');
    expect(current.tableMiscConfig.engine).toBe('MyISAM');
  });

  it('应该设置 storedAs', () => {
    const state = useTableOptionsStore.getState();

    state.setStoredAs('PARQUET');

    const current = useTableOptionsStore.getState();
    expect(current.tableMiscConfig.storedAs).toBe('PARQUET');
  });

  it('应该设置 external', () => {
    const state = useTableOptionsStore.getState();

    state.setExternal(true);

    const current = useTableOptionsStore.getState();
    expect(current.tableMiscConfig.external).toBe(true);
  });

  it('应该设置 location', () => {
    const state = useTableOptionsStore.getState();

    state.setLocation('/data/table');

    const current = useTableOptionsStore.getState();
    expect(current.tableMiscConfig.location).toBe('/data/table');
  });

  it('应该支持直接设置和函数式 setHivePartitionConfig', () => {
    const state = useTableOptionsStore.getState();

    state.setHivePartitionConfig({
      enabled: true,
      columns: [{ name: 'dt', type: 'string' }],
    });

    let current = useTableOptionsStore.getState();
    expect(current.tableMiscConfig.partitions).toEqual({
      enabled: true,
      columns: [{ name: 'dt', type: 'string' }],
    });

    state.setHivePartitionConfig((prev) => ({
      ...prev,
      columns: [...prev.columns, { name: 'region', type: 'string' }],
    }));

    current = useTableOptionsStore.getState();
    expect(current.tableMiscConfig.partitions).toEqual({
      enabled: true,
      columns: [
        { name: 'dt', type: 'string' },
        { name: 'region', type: 'string' },
      ],
    });
  });

  it('应该在 partitions 为 undefined 时，函数式 setHivePartitionConfig 使用默认值', () => {
    const state = useTableOptionsStore.getState();

    expect(state.tableMiscConfig.partitions).toBeUndefined();

    state.setHivePartitionConfig((prev) => ({
      ...prev,
      enabled: true,
    }));

    const current = useTableOptionsStore.getState();
    expect(current.tableMiscConfig.partitions).toEqual({
      enabled: true,
      columns: [],
    });
  });
});
