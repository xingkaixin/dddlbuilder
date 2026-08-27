import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FieldRow } from '@ddlbuilder/shared-types';
import { useFieldRowMutations } from '@/components/App/table/useFieldRowMutations';

const createRow = (overrides: Partial<FieldRow> = {}): FieldRow => ({
  id: 'field-id',
  fieldName: 'id',
  fieldComment: '主键',
  fieldType: 'bigint',
  nullable: true,
  defaultKind: 'constant',
  defaultValue: '1',
  onUpdate: 'current_timestamp',
  ...overrides,
});

describe('useFieldRowMutations', () => {
  it('应该将 nullable 布尔值映射为 是/否', () => {
    let rows: FieldRow[] = [createRow()];
    const setRows = (next: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => {
      rows = typeof next === 'function' ? next(rows) : next;
    };

    const { result, rerender } = renderHook(
      () =>
        useFieldRowMutations({
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
    expect(rows[0].nullable).toBe(false);

    act(() => {
      result.current.updateCellValue(0, 'nullable', true);
    });
    rerender({ currentRows: rows });
    expect(rows[0].nullable).toBe(true);

    // 粘贴/历史数据可能带来非布尔值，可空性判定必须走共享白名单而不是 JS 真值
    act(() => {
      result.current.updateCellValue(0, 'nullable', '否');
    });
    rerender({ currentRows: rows });
    expect(rows[0].nullable).toBe(false);
  });

  it('应该处理 defaultKind 联动逻辑', () => {
    let rows: FieldRow[] = [createRow()];
    const setRows = (next: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => {
      rows = typeof next === 'function' ? next(rows) : next;
    };

    const { result, rerender } = renderHook(
      () =>
        useFieldRowMutations({
          setRows,
        }),
      {
        initialProps: { currentRows: rows },
      },
    );

    act(() => {
      result.current.updateCellValue(0, 'defaultKind', 'auto_increment');
    });
    rerender({ currentRows: rows });
    expect(rows[0].defaultKind).toBe('auto_increment');
    expect(rows[0].nullable).toBe(false);
    expect(rows[0].defaultValue).toBe('');

    act(() => {
      result.current.updateCellValue(0, 'defaultKind', 'uuid');
    });
    rerender({ currentRows: rows });
    expect(rows[0].onUpdate).toBe('none');
    expect(rows[0].defaultValue).toBe('');
  });

  it('应该通过行更新提交字段名变更', () => {
    let rows: FieldRow[] = [createRow({ fieldName: 'user_id' })];
    const setRows = (next: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => {
      rows = typeof next === 'function' ? next(rows) : next;
    };

    const { result, rerender } = renderHook(
      () =>
        useFieldRowMutations({
          setRows,
        }),
      {
        initialProps: { currentRows: rows },
      },
    );

    act(() => {
      result.current.updateCellValue(0, 'fieldName', 'account_id');
    });
    rerender({ currentRows: rows });

    expect(rows[0].fieldName).toBe('account_id');
  });
});
