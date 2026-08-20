import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  useSortableFieldRows,
  reorderFieldRowsByIds,
} from '@/components/App/table/useSortableFieldRows';
import type { FieldRow } from '@ddlbuilder/shared-types';

function createRows(names: string[]): FieldRow[] {
  return names.map((name, index) => ({
    order: index + 1,
    fieldName: name,
    fieldType: 'int',
    fieldComment: '',
    nullable: true,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
  }));
}

describe('reorderFieldRowsByIds', () => {
  it('应按 active/over 重排并重新编号', () => {
    const rows = createRows(['f1', 'f2', 'f3']);

    const reordered = reorderFieldRowsByIds(rows, '1', '3');

    expect(reordered.map((row) => row.fieldName)).toEqual(['f2', 'f3', 'f1']);
    expect(reordered.map((row) => row.order)).toEqual([1, 2, 3]);
  });

  it('over 为空时应返回原数组引用', () => {
    const rows = createRows(['f1', 'f2']);

    const reordered = reorderFieldRowsByIds(rows, '1', null);

    expect(reordered).toBe(rows);
  });

  it('active 与 over 相同应返回原数组引用', () => {
    const rows = createRows(['f1', 'f2']);

    const reordered = reorderFieldRowsByIds(rows, '1', '1');

    expect(reordered).toBe(rows);
  });

  it('找不到对应索引时应返回原数组引用', () => {
    const rows = createRows(['f1', 'f2']);

    const reordered = reorderFieldRowsByIds(rows, '999', '1');

    expect(reordered).toBe(rows);
  });

  it('有效拖拽时应返回新引用（可用于触发反馈）', () => {
    const rows = createRows(['f1', 'f2', 'f3']);
    const onDragResult = vi.fn();

    const reordered = reorderFieldRowsByIds(rows, '1', '2');
    onDragResult({ moved: reordered !== rows });

    expect(onDragResult).toHaveBeenCalledWith({ moved: true });
  });
});

describe('useSortableFieldRows', () => {
  it('应初始化 sensors 和 rowIds', () => {
    const rows = createRows(['f1', 'f2']);
    const setRows = vi.fn();

    const { result } = renderHook(() => useSortableFieldRows({ rows, setRows }));

    expect(result.current.sensors).toBeDefined();
    expect(result.current.rowIds).toEqual(['1', '2']);
  });

  it('handleDragEnd 应调用 setRows 和 onDragResult', () => {
    const rows = createRows(['f1', 'f2', 'f3']);
    const setRows = vi.fn();
    const onDragResult = vi.fn();

    const { result } = renderHook(() => useSortableFieldRows({ rows, setRows, onDragResult }));

    act(() => {
      result.current.handleDragEnd({
        active: { id: '1' },
        over: { id: '3' },
      } as any);
    });

    expect(setRows).toHaveBeenCalled();
    const setRowsUpdater = setRows.mock.calls[0][0];
    const newRows = setRowsUpdater(rows);
    expect(newRows.map((r: FieldRow) => r.fieldName)).toEqual(['f2', 'f3', 'f1']);

    expect(onDragResult).toHaveBeenCalledWith({
      moved: true,
      activeId: '1',
      overId: '3',
    });
  });

  it('handleDragEnd 会在没有 over 时按正确格式回调', () => {
    const rows = createRows(['f1', 'f2']);
    const setRows = vi.fn();
    const onDragResult = vi.fn();

    const { result } = renderHook(() => useSortableFieldRows({ rows, setRows, onDragResult }));

    act(() => {
      result.current.handleDragEnd({
        active: { id: '1' },
        over: null,
      } as any);
    });

    expect(onDragResult).toHaveBeenCalledWith({
      moved: false,
      activeId: '1',
      overId: null,
    });
  });

  it('handleDragEnd 会在 active 和 over 相同时将其判断为未移动', () => {
    const rows = createRows(['f1', 'f2']);
    const setRows = vi.fn();
    const onDragResult = vi.fn();

    const { result } = renderHook(() => useSortableFieldRows({ rows, setRows, onDragResult }));

    act(() => {
      result.current.handleDragEnd({
        active: { id: '1' },
        over: { id: '1' },
      } as any);
    });

    expect(onDragResult).toHaveBeenCalledWith({
      moved: false,
      activeId: '1',
      overId: '1',
    });
  });

  it('handleDragEnd 如果 active 不在 rows 中不被视为已移动', () => {
    const rows = createRows(['f1', 'f2']);
    const setRows = vi.fn();
    const onDragResult = vi.fn();

    const { result } = renderHook(() => useSortableFieldRows({ rows, setRows, onDragResult }));

    act(() => {
      result.current.handleDragEnd({
        active: { id: '999' },
        over: { id: '1' },
      } as any);
    });

    expect(onDragResult).toHaveBeenCalledWith({
      moved: false,
      activeId: '999',
      overId: '1',
    });
  });

  it('handleDragEnd 如果 over 不在 rows 中不被视为已移动', () => {
    const rows = createRows(['f1', 'f2']);
    const setRows = vi.fn();
    const onDragResult = vi.fn();

    const { result } = renderHook(() => useSortableFieldRows({ rows, setRows, onDragResult }));

    act(() => {
      result.current.handleDragEnd({
        active: { id: '1' },
        over: { id: '999' },
      } as any);
    });

    expect(onDragResult).toHaveBeenCalledWith({
      moved: false,
      activeId: '1',
      overId: '999',
    });
  });
});
