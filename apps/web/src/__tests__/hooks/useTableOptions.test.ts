import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTableOptions } from '@/hooks/useTableOptions';
import { useTableOptionsStore } from '@/stores';

function resetTableOptionsStore() {
  useTableOptionsStore.getState().resetTableMiscConfig();
}

describe('useTableOptions', () => {
  beforeEach(() => {
    resetTableOptionsStore();
  });

  it('应该暴露更新与重置配置的能力', () => {
    const { result } = renderHook(() => useTableOptions());

    act(() => {
      result.current.setMiscEnabled(true);
      result.current.setEngine('InnoDB');
      result.current.setCharset('utf8mb4');
      result.current.setCollation('utf8mb4_0900_ai_ci');
      result.current.setTablespace('ts_app');
      result.current.setTableMiscConfig((prev) => ({
        ...prev,
        engine: 'RocksDB',
      }));
    });

    expect(result.current.tableMiscConfig).toEqual({
      enabled: true,
      engine: 'RocksDB',
      charset: 'utf8mb4',
      collation: 'utf8mb4_0900_ai_ci',
      tablespace: 'ts_app',
    });

    act(() => {
      result.current.resetTableMiscConfig();
    });

    expect(result.current.tableMiscConfig).toEqual({
      enabled: false,
      engine: '',
      charset: '',
      collation: '',
      tablespace: '',
    });
  });

  it('应该集中处理 Hive 分区列和分桶配置', () => {
    const { result } = renderHook(() => useTableOptions());

    act(() => {
      result.current.setHivePartitionEnabled(true);
      result.current.addHivePartitionColumn({ name: 'dt', type: 'STRING', comment: '日期' });
      result.current.updateHivePartitionColumn(0, {
        name: 'event_date',
        type: 'DATE',
        comment: '事件日期',
      });
      result.current.setHiveClustering({ enabled: true, columns: ['id'], bucketCount: 8 });
    });

    expect(result.current.tableMiscConfig.partitions).toEqual({
      enabled: true,
      columns: [{ name: 'event_date', type: 'DATE', comment: '事件日期' }],
      clustering: { enabled: true, columns: ['id'], bucketCount: 8 },
    });

    act(() => result.current.removeHivePartitionColumn(0));
    expect(result.current.tableMiscConfig.partitions?.columns).toEqual([]);
  });
});
