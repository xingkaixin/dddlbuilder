import { beforeEach, describe, expect, it } from 'vitest';
import { useIndexStore } from '@/stores';

function resetIndexStore() {
  useIndexStore.getState().resetIndexState();
  useIndexStore.getState().setIndexes([]);
}

describe('indexStore', () => {
  beforeEach(() => {
    resetIndexStore();
  });

  it('应该添加索引字段并创建索引', () => {
    const state = useIndexStore.getState();

    state.addFieldToIndex('id');
    let current = useIndexStore.getState();
    expect(current.currentIndexFields).toEqual([
      { name: 'id', direction: 'ASC' },
    ]);

    state.addIndex(false, false, 'users', 'mysql');
    current = useIndexStore.getState();
    expect(current.indexes.length).toBe(1);
    expect(current.indexes[0].fields[0].name).toBe('id');
    expect(current.currentIndexFields.length).toBe(0);
  });

  it('应该更新索引名称并支持重置', () => {
    const state = useIndexStore.getState();

    state.setIndexes([
      {
        id: '1',
        name: 'idx_old',
        fields: [{ name: 'id', direction: 'ASC' }],
        unique: false,
      },
    ]);
    state.updateIndexName('1', 'idx_users_id', 'mysql');

    let current = useIndexStore.getState();
    expect(current.indexes[0].name).toBe('idx_users_id');

    state.resetIndexState();
    current = useIndexStore.getState();
    expect(current.indexInput).toBe('');
    expect(current.currentIndexFields).toEqual([]);
    expect(current.showFieldSuggestions).toBe(false);
    expect(current.selectedSuggestionIndex).toBe(0);
  });
});
