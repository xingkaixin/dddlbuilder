import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FieldRow } from '@ddlbuilder/shared-types';
import { useFieldRowMutations } from '@/components/App/table/useFieldRowMutations';

const createRow = (overrides: Partial<FieldRow> = {}): FieldRow => ({
  order: 1,
  fieldName: 'id',
  fieldComment: '主键',
  fieldType: 'bigint',
  nullable: '是',
  defaultKind: '常量',
  defaultValue: '1',
  onUpdate: '当前时间',
  ...overrides,
});

describe('useFieldRowMutations', () => {
  it('应该将 nullable 布尔值映射为 是/否', () => {
    let rows: FieldRow[] = [createRow()];
    const setRows = (next: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => {
      rows = typeof next === 'function' ? next(rows) : next;
    };

    const { result, rerender } = renderHook(
      ({ currentRows }) =>
        useFieldRowMutations({
          rows: currentRows,
          setRows,
        }),
      {
        initialProps: { currentRows: rows },
      },
    );

    act(() => {
      result.current.updateCellValue(0, 'nullable', false);
    });
    rerender({ currentRows: rows });
    expect(rows[0].nullable).toBe('否');

    act(() => {
      result.current.updateCellValue(0, 'nullable', true);
    });
    rerender({ currentRows: rows });
    expect(rows[0].nullable).toBe('是');
  });

  it('应该处理 defaultKind 联动逻辑', () => {
    let rows: FieldRow[] = [createRow()];
    const setRows = (next: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => {
      rows = typeof next === 'function' ? next(rows) : next;
    };

    const { result, rerender } = renderHook(
      ({ currentRows }) =>
        useFieldRowMutations({
          rows: currentRows,
          setRows,
        }),
      {
        initialProps: { currentRows: rows },
      },
    );

    act(() => {
      result.current.updateCellValue(0, 'defaultKind', '自增');
    });
    rerender({ currentRows: rows });
    expect(rows[0].defaultKind).toBe('自增');
    expect(rows[0].nullable).toBe('否');
    expect(rows[0].defaultValue).toBe('');

    act(() => {
      result.current.updateCellValue(0, 'defaultKind', 'uuid');
    });
    rerender({ currentRows: rows });
    expect(rows[0].onUpdate).toBe('无');
    expect(rows[0].defaultValue).toBe('');
  });

  it('应该在字段名变更时触发依赖回调', () => {
    let rows: FieldRow[] = [createRow({ fieldName: 'user_id' })];
    const setRows = (next: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => {
      rows = typeof next === 'function' ? next(rows) : next;
    };
    const onFieldRename = vi.fn();

    const { result, rerender } = renderHook(
      ({ currentRows }) =>
        useFieldRowMutations({
          rows: currentRows,
          setRows,
          onFieldRename,
        }),
      {
        initialProps: { currentRows: rows },
      },
    );

    act(() => {
      result.current.updateCellValue(0, 'fieldName', 'account_id');
    });
    rerender({ currentRows: rows });

    expect(onFieldRename).toHaveBeenCalledTimes(1);
    expect(onFieldRename).toHaveBeenCalledWith('user_id', 'account_id');
    expect(rows[0].fieldName).toBe('account_id');
  });
});
