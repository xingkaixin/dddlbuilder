import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyRow } from '@/utils/helpers';
import { useAppStore, useFieldStore, useIndexStore } from '@/stores';
import { useAppSelectors } from '@/components/App/hooks/useAppSelectors';

function resetAppStore() {
  const state = useAppStore.getState();
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
  state.setIsMockDataDialogOpen(false);
  state.setTimelinePlayerTarget(null);
}

function resetFieldStore() {
  const state = useFieldStore.getState();
  state.resetRows(12);
}

function resetIndexStore() {
  const state = useIndexStore.getState();
  state.resetIndexState();
  state.setIndexes([]);
}

function useDataTableSelectorProbe() {
  const rowsLength = useFieldStore((state) => state.rows.length);
  const dbType = useAppStore((state) => state.dbType);
  const addCount = useAppStore((state) => state.addCount);
  const freezeEnabled = useAppStore((state) => state.fieldTableFreezeEnabled);
  const freezeColumns = useAppStore((state) => state.fieldTableFreezeColumns);

  return { rowsLength, dbType, addCount, freezeEnabled, freezeColumns };
}

function useIndexPanelSelectorProbe() {
  const tableName = useAppStore((state) => state.tableName);
  const dbType = useAppStore((state) => state.dbType);
  const rowsLength = useFieldStore((state) => state.rows.length);
  const indexInput = useIndexStore((state) => state.indexInput);
  const currentIndexFieldsLength = useIndexStore((state) => state.currentIndexFields.length);
  const indexesLength = useIndexStore((state) => state.indexes.length);

  return {
    tableName,
    dbType,
    rowsLength,
    indexInput,
    currentIndexFieldsLength,
    indexesLength,
  };
}

describe('store selector subscription scope', () => {
  beforeEach(() => {
    resetAppStore();
    resetFieldStore();
    resetIndexStore();

    useFieldStore.getState().setRows([
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
      useAppStore.getState().setIsClearDialogOpen(true);
    });

    expect(renderCount).toBe(initialRenderCount);

    act(() => {
      useAppStore.getState().setAddCount(33);
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
      useAppStore.getState().setIsStorageEstimatorOpen(true);
    });

    expect(renderCount).toBe(initialRenderCount);

    act(() => {
      useIndexStore.getState().setIndexInput('id');
    });

    expect(renderCount).toBe(initialRenderCount + 1);
    expect(result.current.indexInput).toBe('id');
  });

  it('App 编辑器 selector 不订阅纯弹窗可见状态', () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useAppSelectors();
    });
    const initialRenderCount = renderCount;

    act(() => {
      const state = useAppStore.getState();
      state.setIsDiffDialogOpen(true);
      state.setIsStorageEstimatorOpen(true);
      state.setVersionHistoryTarget({
        normalizedName: 'orders',
        name: 'orders',
        dbType: 'mysql',
        fieldCount: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    expect(renderCount).toBe(initialRenderCount);

    act(() => {
      useAppStore.getState().setTableName('orders');
    });

    expect(renderCount).toBe(initialRenderCount + 1);
    expect(result.current.tableName).toBe('orders');
  });
});
