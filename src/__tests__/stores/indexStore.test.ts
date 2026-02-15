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

  it('字段重命名时应同步索引字段和索引名', () => {
    const state = useIndexStore.getState();

    state.setCurrentIndexFields([{ name: 'name', direction: 'ASC' }]);
    state.setIndexes([
      {
        id: '1',
        name: 'idx_users_name',
        fields: [{ name: 'name', direction: 'ASC' }],
        unique: false,
      },
      {
        id: '2',
        name: 'idx_users_age',
        fields: [{ name: 'age', direction: 'ASC' }],
        unique: false,
      },
    ]);

    state.syncFieldRename('name', 'nickname', 'mysql');

    const current = useIndexStore.getState();
    expect(current.currentIndexFields).toEqual([
      { name: 'nickname', direction: 'ASC' },
    ]);
    expect(current.indexes[0]).toMatchObject({
      name: 'idx_users_nickname',
      fields: [{ name: 'nickname', direction: 'ASC' }],
    });
    expect(current.indexes[1]).toMatchObject({
      name: 'idx_users_age',
      fields: [{ name: 'age', direction: 'ASC' }],
    });
  });

  it('字段重命名不应误替换索引名中的普通子串', () => {
    const state = useIndexStore.getState();

    state.setIndexes([
      {
        id: '1',
        name: 'idx_video_id',
        fields: [{ name: 'id', direction: 'ASC' }],
        unique: false,
      },
    ]);

    state.syncFieldRename('id', 'uuid', 'mysql');

    const current = useIndexStore.getState();
    expect(current.indexes[0].name).toBe('idx_video_uuid');
  });

  it('字段重命名应支持大小写不敏感匹配', () => {
    const state = useIndexStore.getState();

    state.setCurrentIndexFields([{ name: 'Name', direction: 'ASC' }]);
    state.setIndexes([
      {
        id: '1',
        name: 'idx_users_NAME',
        fields: [{ name: 'Name', direction: 'ASC' }],
        unique: false,
      },
    ]);

    state.syncFieldRename('name', 'nickname', 'mysql');

    const current = useIndexStore.getState();
    expect(current.currentIndexFields).toEqual([
      { name: 'nickname', direction: 'ASC' },
    ]);
    expect(current.indexes[0]).toMatchObject({
      name: 'idx_users_nickname',
      fields: [{ name: 'nickname', direction: 'ASC' }],
    });
  });
});
