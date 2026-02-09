import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/stores';

function resetAppStore() {
  const state = useAppStore.getState();
  state.resetTableConfig();
  state.resetTableViewConfig();
  state.setSavedTablesDrawerOpen(false);
  state.setIsSaveDialogOpen(false);
  state.setIsRenameDialogOpen(false);
  state.setIsDeleteDialogOpen(false);
  state.setIsLoadConfirmOpen(false);
}

describe('appStore', () => {
  beforeEach(() => {
    resetAppStore();
  });

  it('应该更新并重置表配置状态', () => {
    const state = useAppStore.getState();

    state.setTableName('users');
    state.setTableComment('用户表');
    state.setDbType('postgresql');

    let current = useAppStore.getState();
    expect(current.tableName).toBe('users');
    expect(current.tableComment).toBe('用户表');
    expect(current.dbType).toBe('postgresql');

    current.resetTableConfig();
    current = useAppStore.getState();
    expect(current.tableName).toBe('');
    expect(current.tableComment).toBe('');
    expect(current.dbType).toBe('mysql');
  });

  it('应该更新并重置表格视图状态', () => {
    const state = useAppStore.getState();

    state.setAddCount(25);
    state.setFieldTableFreezeEnabled(false);
    state.setFieldTableFreezeColumns(6);
    state.setActiveTab('indexes');

    let current = useAppStore.getState();
    expect(current.addCount).toBe(25);
    expect(current.fieldTableFreezeEnabled).toBe(false);
    expect(current.fieldTableFreezeColumns).toBe(6);
    expect(current.activeTab).toBe('indexes');

    current.resetTableViewConfig();
    current = useAppStore.getState();
    expect(current.addCount).toBe(10);
    expect(current.fieldTableFreezeEnabled).toBe(true);
    expect(current.fieldTableFreezeColumns).toBe(3);
    expect(current.activeTab).toBe('fields');
  });

  it('应该管理保存表抽屉和核心对话框开关', () => {
    const state = useAppStore.getState();

    state.setSavedTablesDrawerOpen(true);
    state.setIsSaveDialogOpen(true);
    state.setIsRenameDialogOpen(true);
    state.setIsDeleteDialogOpen(true);
    state.setIsLoadConfirmOpen(true);

    let current = useAppStore.getState();
    expect(current.savedTablesDrawerOpen).toBe(true);
    expect(current.dialogs.save).toBe(true);
    expect(current.dialogs.rename).toBe(true);
    expect(current.dialogs.delete).toBe(true);
    expect(current.dialogs.loadConfirm).toBe(true);

    current.setSavedTablesDrawerOpen(false);
    current.setIsSaveDialogOpen(false);
    current.setIsRenameDialogOpen(false);
    current.setIsDeleteDialogOpen(false);
    current.setIsLoadConfirmOpen(false);

    current = useAppStore.getState();
    expect(current.savedTablesDrawerOpen).toBe(false);
    expect(current.dialogs.save).toBe(false);
    expect(current.dialogs.rename).toBe(false);
    expect(current.dialogs.delete).toBe(false);
    expect(current.dialogs.loadConfirm).toBe(false);
  });
});
