import { act, renderHook, waitFor } from '@testing-library/react';
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

  it('应该只从持久化配置中初始化一次', async () => {
    const firstPersisted = {
      tableMiscConfig: {
        enabled: true,
        engine: 'InnoDB',
        charset: 'utf8mb4',
        collation: 'utf8mb4_general_ci',
        tablespace: 'ts_1',
      },
    };

    const { result, rerender } = renderHook(({ persisted }) => useTableOptions(persisted), {
      initialProps: { persisted: firstPersisted },
    });

    await waitFor(() => {
      expect(result.current.tableMiscConfig).toEqual(firstPersisted.tableMiscConfig);
    });
    expect(useTableOptionsStore.getState().hydratedFromPersisted).toBe(true);

    rerender({
      persisted: {
        tableMiscConfig: {
          enabled: true,
          engine: 'MyISAM',
          charset: 'latin1',
          collation: 'latin1_swedish_ci',
          tablespace: 'ts_2',
        },
      },
    });

    expect(result.current.tableMiscConfig.engine).toBe('InnoDB');
    expect(result.current.tableMiscConfig.charset).toBe('utf8mb4');
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
    expect(useTableOptionsStore.getState().hydratedFromPersisted).toBe(false);
  });
});
