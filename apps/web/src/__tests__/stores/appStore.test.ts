import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores';

function resetAppStore() {
  const state = useEditorStore.getState();
  state.resetTableConfig();
  state.resetTableViewConfig();
}

describe('appStore', () => {
  beforeEach(() => {
    resetAppStore();
  });

  it('应该更新并重置表配置状态', () => {
    const state = useEditorStore.getState();

    state.setTableName('users');
    state.setTableComment('用户表');
    state.setObjectType('view');
    state.setViewDefinition('SELECT id FROM users');
    state.setViewCreateOrReplace(false);
    state.setDbType('postgresql');

    let current = useEditorStore.getState();
    expect(current.tableName).toBe('users');
    expect(current.tableComment).toBe('用户表');
    expect(current.objectType).toBe('view');
    expect(current.viewDefinition).toBe('SELECT id FROM users');
    expect(current.viewCreateOrReplace).toBe(false);
    expect(current.dbType).toBe('postgresql');

    current.resetTableConfig();
    current = useEditorStore.getState();
    expect(current.tableName).toBe('');
    expect(current.tableComment).toBe('');
    expect(current.objectType).toBe('table');
    expect(current.viewDefinition).toBe('');
    expect(current.viewCreateOrReplace).toBe(true);
    expect(current.dbType).toBe('mysql');
  });

  it('应该更新并重置表格视图状态', () => {
    const state = useEditorStore.getState();

    state.setAddCount(25);
    state.setFieldTableFreezeEnabled(false);
    state.setFieldTableFreezeColumns(6);
    state.setActiveTab('indexes');

    let current = useEditorStore.getState();
    expect(current.addCount).toBe(25);
    expect(current.fieldTableFreezeEnabled).toBe(false);
    expect(current.fieldTableFreezeColumns).toBe(6);
    expect(current.activeTab).toBe('indexes');

    current.resetTableViewConfig();
    current = useEditorStore.getState();
    expect(current.addCount).toBe(10);
    expect(current.fieldTableFreezeEnabled).toBe(false);
    expect(current.fieldTableFreezeColumns).toBe(3);
    expect(current.activeTab).toBe('fields');
  });

  it('应该限制批量新增数和冻结列数', () => {
    const state = useEditorStore.getState();

    state.setAddCount(1_000_000_000);
    state.setFieldTableFreezeColumns(-20);

    expect(useEditorStore.getState()).toMatchObject({
      addCount: 100,
      fieldTableFreezeColumns: 0,
    });
  });
});
