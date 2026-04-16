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

  it('应该支持函数式 setTableMiscConfig', () => {
    const state = useTableOptionsStore.getState();

    state.setTableMiscConfig((prev) => ({
      ...prev,
      enabled: true,
      tablespace: 'ts_app',
    }));

    const current = useTableOptionsStore.getState();
    expect(current.tableMiscConfig.enabled).toBe(true);
    expect(current.tableMiscConfig.tablespace).toBe('ts_app');
  });

  it('应该在重置时清理持久化初始化标记', () => {
    const state = useTableOptionsStore.getState();

    expect(state.hydratedFromPersisted).toBe(false);
    state.markHydratedFromPersisted();
    expect(useTableOptionsStore.getState().hydratedFromPersisted).toBe(true);

    useTableOptionsStore.getState().resetTableMiscConfig();
    expect(useTableOptionsStore.getState().hydratedFromPersisted).toBe(false);
  });
});
