import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores';

function resetAppStore() {
  const state = useEditorStore.getState();
  state.resetTableConfig();
  state.resetTableViewConfig();
  state.setSavedTablesDrawerOpen(false);
  state.setIsSaveDialogOpen(false);
  state.setIsRenameDialogOpen(false);
  state.setIsDeleteDialogOpen(false);
  state.setIsClearDialogOpen(false);
  state.setShowFireworks(false);
  state.setIsDiffDialogOpen(false);
  state.setVersionHistoryTarget(null);
  state.setIsReviewHistoryOpen(false);
  state.setIsStorageEstimatorOpen(false);
  state.setIsAIGenerateDialogOpen(false);
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

  it('应该管理保存表抽屉和核心对话框开关', () => {
    const state = useEditorStore.getState();

    state.setSavedTablesDrawerOpen(true);
    state.setIsSaveDialogOpen(true);
    state.setIsRenameDialogOpen(true);
    state.setIsDeleteDialogOpen(true);

    let current = useEditorStore.getState();
    expect(current.savedTablesDrawerOpen).toBe(true);
    expect(current.dialogs.save).toBe(true);
    expect(current.dialogs.rename).toBe(true);
    expect(current.dialogs.delete).toBe(true);

    current.setSavedTablesDrawerOpen(false);
    current.setIsSaveDialogOpen(false);
    current.setIsRenameDialogOpen(false);
    current.setIsDeleteDialogOpen(false);

    current = useEditorStore.getState();
    expect(current.savedTablesDrawerOpen).toBe(false);
    expect(current.dialogs.save).toBe(false);
    expect(current.dialogs.rename).toBe(false);
    expect(current.dialogs.delete).toBe(false);
  });

  it('应该管理批次4迁移的全局 UI 状态', () => {
    const state = useEditorStore.getState();

    state.setIsClearDialogOpen(true);
    state.setShowFireworks(true);
    state.setIsDiffDialogOpen(true);
    state.setVersionHistoryTarget({
      normalizedName: 'users',
      name: 'Users',
    });
    state.setIsReviewHistoryOpen(true);
    state.setIsStorageEstimatorOpen(true);
    state.setIsAIGenerateDialogOpen(true);

    let current = useEditorStore.getState();
    expect(current.isClearDialogOpen).toBe(true);
    expect(current.showFireworks).toBe(true);
    expect(current.isDiffDialogOpen).toBe(true);
    expect(current.versionHistoryTarget).toEqual({
      normalizedName: 'users',
      name: 'Users',
    });
    expect(current.isReviewHistoryOpen).toBe(true);
    expect(current.isStorageEstimatorOpen).toBe(true);
    expect(current.isAIGenerateDialogOpen).toBe(true);

    current.setIsClearDialogOpen(false);
    current.setShowFireworks(false);
    current.setIsDiffDialogOpen(false);
    current.setVersionHistoryTarget(null);
    current.setIsReviewHistoryOpen(false);
    current.setIsStorageEstimatorOpen(false);
    current.setIsAIGenerateDialogOpen(false);

    current = useEditorStore.getState();
    expect(current.isClearDialogOpen).toBe(false);
    expect(current.showFireworks).toBe(false);
    expect(current.isDiffDialogOpen).toBe(false);
    expect(current.versionHistoryTarget).toBeNull();
    expect(current.isReviewHistoryOpen).toBe(false);
    expect(current.isStorageEstimatorOpen).toBe(false);
    expect(current.isAIGenerateDialogOpen).toBe(false);
  });
});
