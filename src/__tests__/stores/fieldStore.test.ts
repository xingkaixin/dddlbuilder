import { beforeEach, describe, expect, it } from 'vitest';
import { useFieldStore } from '@/stores';
import { createEmptyRow } from '@/utils/helpers';

function resetFieldStore() {
  useFieldStore.getState().resetRows(12);
}

describe('fieldStore', () => {
  beforeEach(() => {
    resetFieldStore();
  });

  it('应该支持增删行并保持顺序', () => {
    const state = useFieldStore.getState();

    state.handleAddRows(2);
    let current = useFieldStore.getState();
    expect(current.rows.length).toBe(14);
    expect(current.rows[0].order).toBe(1);
    expect(current.rows[13].order).toBe(14);

    state.handleRemoveRow(0, 3);
    current = useFieldStore.getState();
    expect(current.rows.length).toBe(11);
    expect(current.rows[0].order).toBe(1);
    expect(current.rows[10].order).toBe(11);
  });

  it('应该处理单元格变更并应用 defaultKind 规则', () => {
    const state = useFieldStore.getState();
    state.setRows([createEmptyRow(0)]);

    state.handleRowsChange(
      [
        [0, 'fieldName', '', 'id'],
        [0, 'defaultKind', '无', '自增'],
      ],
      'edit',
    );

    const current = useFieldStore.getState();
    expect(current.rows[0].fieldName).toBe('id');
    expect(current.rows[0].defaultKind).toBe('自增');
    expect(current.rows[0].nullable).toBe('否');
    expect(current.rows[0].defaultValue).toBe('');
  });
});
