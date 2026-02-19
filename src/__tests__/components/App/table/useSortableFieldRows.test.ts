import { describe, expect, it } from 'vitest';
import { reorderFieldRowsByIds } from '@/components/App/table/useSortableFieldRows';
import type { FieldRow } from '@/types';

function createRows(names: string[]): FieldRow[] {
  return names.map((name, index) => ({
    order: index + 1,
    fieldName: name,
    fieldType: 'int',
    fieldComment: '',
    nullable: '是',
    defaultKind: '无',
    defaultValue: '',
    onUpdate: '无',
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
});
