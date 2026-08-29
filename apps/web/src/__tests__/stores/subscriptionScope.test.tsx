import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyRow } from '@/utils/helpers';
import { useAppUiStore, useEditorStore } from '@/stores';
import { useAppSelectors } from '@/components/App/hooks/useAppSelectors';

function resetAppStore() {
  useEditorStore.getState().resetTableConfig();
  useEditorStore.getState().resetTableViewConfig();
  const ui = useAppUiStore.getState();
  ui.setSavedTablesDrawerOpen(false);
  ui.setIsSaveDialogOpen(false);
  ui.setIsRenameDialogOpen(false);
  ui.setIsDeleteDialogOpen(false);
  ui.setIsClearDialogOpen(false);
  ui.setShowFireworks(false);
  ui.setIsDiffDialogOpen(false);
  ui.setVersionHistoryTarget(null);
  ui.setIsReviewHistoryOpen(false);
  ui.setIsStorageEstimatorOpen(false);
  ui.setIsAIGenerateDialogOpen(false);
  ui.setIsMockDataDialogOpen(false);
  ui.setTimelinePlayerTarget(null);
}

function resetFieldStore() {
  const state = useEditorStore.getState();
  state.resetRows(12);
}

function resetIndexStore() {
  const state = useEditorStore.getState();
  state.resetIndexState();
  state.setIndexes([]);
}

function useDataTableSelectorProbe() {
  const rowsLength = useEditorStore((state) => state.rows.length);
  const dbType = useEditorStore((state) => state.dbType);
  const addCount = useEditorStore((state) => state.addCount);
  const freezeEnabled = useEditorStore((state) => state.fieldTableFreezeEnabled);
  const freezeColumns = useEditorStore((state) => state.fieldTableFreezeColumns);

  return { rowsLength, dbType, addCount, freezeEnabled, freezeColumns };
}

function useIndexPanelSelectorProbe() {
  const tableName = useEditorStore((state) => state.tableName);
  const dbType = useEditorStore((state) => state.dbType);
  const rowsLength = useEditorStore((state) => state.rows.length);
  const indexesLength = useEditorStore((state) => state.indexes.length);

  return {
    tableName,
    dbType,
    rowsLength,
    indexesLength,
  };
}

describe('store selector subscription scope', () => {
  beforeEach(() => {
    resetAppStore();
    resetFieldStore();
    resetIndexStore();

    useEditorStore.getState().setRows([
      {
        ...createEmptyRow(0),
        fieldName: 'id',
        fieldType: 'bigint',
      },
    ]);
  });

  it('DataTable 相关 selector 对无关状态更新不重渲染', () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useDataTableSelectorProbe();
    });

    const initialRenderCount = renderCount;

    act(() => {
      useAppUiStore.getState().setIsClearDialogOpen(true);
    });

    expect(renderCount).toBe(initialRenderCount);

    act(() => {
      useEditorStore.getState().setAddCount(33);
    });

    expect(renderCount).toBe(initialRenderCount + 1);
    expect(result.current.addCount).toBe(33);
  });

  it('IndexPanel 相关 selector 对无关状态更新不重渲染', () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useIndexPanelSelectorProbe();
    });

    const initialRenderCount = renderCount;

    act(() => {
      useAppUiStore.getState().setIsStorageEstimatorOpen(true);
    });

    expect(renderCount).toBe(initialRenderCount);

    act(() => {
      useEditorStore
        .getState()
        .setIndexes([{ id: '1', name: 'idx_users_id', fields: [], kind: 'index' }]);
    });

    expect(renderCount).toBe(initialRenderCount + 1);
    expect(result.current.indexesLength).toBe(1);
  });

  it('App 编辑器 selector 不订阅纯弹窗可见状态', () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useAppSelectors();
    });
    const initialRenderCount = renderCount;

    act(() => {
      const state = useAppUiStore.getState();
      state.setIsDiffDialogOpen(true);
      state.setIsStorageEstimatorOpen(true);
      state.setVersionHistoryTarget({
        normalizedName: 'orders',
        name: 'orders',
      });
    });

    expect(renderCount).toBe(initialRenderCount);

    act(() => {
      useEditorStore.getState().setTableName('orders');
    });

    expect(renderCount).toBe(initialRenderCount + 1);
    expect(result.current.tableName).toBe('orders');
  });
});
