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

  it('空字段时不创建索引，且主键只允许一个', () => {
    const state = useIndexStore.getState();

    state.addIndex(false, false, 'users', 'mysql');
    expect(useIndexStore.getState().indexes.length).toBe(0);

    state.addFieldToIndex('id');
    state.addIndex(true, true, 'users', 'mysql');
    expect(useIndexStore.getState().indexes.length).toBe(1);
    expect(useIndexStore.getState().indexes[0].name).toBe('pk_users');

    state.addFieldToIndex('name');
    state.addIndex(true, true, 'users', 'mysql');
    expect(useIndexStore.getState().indexes.length).toBe(1);
  });

  it('应支持初始化、切换排序方向与删除字段', () => {
    const state = useIndexStore.getState();
    const persisted = {
      indexInput: 'na',
      currentIndexFields: [{ name: 'name', direction: 'ASC' as const }],
      indexes: [],
    };

    state.initializeIndexState(undefined);
    state.initializeIndexState(persisted);
    expect(useIndexStore.getState().indexInput).toBe('na');

    state.toggleFieldDirection(0);
    expect(useIndexStore.getState().currentIndexFields[0].direction).toBe(
      'DESC',
    );

    state.removeFieldFromIndex(0);
    expect(useIndexStore.getState().currentIndexFields).toEqual([]);
  });

  it('应忽略空名称更新，并在 Oracle 下截断过长索引名', () => {
    const state = useIndexStore.getState();
    state.setIndexes([
      {
        id: '1',
        name: 'idx_old',
        fields: [{ name: 'id', direction: 'ASC' }],
        unique: false,
      },
    ]);

    state.updateIndexName('1', '   ', 'mysql');
    expect(useIndexStore.getState().indexes[0].name).toBe('idx_old');

    const longName = `idx_${'a'.repeat(80)}`;
    state.updateIndexName('1', longName, 'oracle');
    expect(useIndexStore.getState().indexes[0].name.length).toBeLessThanOrEqual(
      30,
    );
  });

  it('应批量更新索引名并跳过空表名', () => {
    const state = useIndexStore.getState();
    state.setIndexes([
      {
        id: '1',
        name: 'pk_users',
        fields: [{ name: 'id', direction: 'ASC' }],
        unique: true,
        isPrimary: true,
      },
      {
        id: '2',
        name: 'idx_users_name',
        fields: [{ name: 'name', direction: 'ASC' }],
        unique: false,
      },
      {
        id: '3',
        name: 'uk_users_email',
        fields: [{ name: 'email', direction: 'ASC' }],
        unique: true,
      },
    ]);

    state.updateIndexNames('', 'mysql');
    expect(useIndexStore.getState().indexes[0].name).toBe('pk_users');

    state.updateIndexNames('orders', 'mysql');
    const current = useIndexStore.getState();
    expect(current.indexes[0].name).toBe('pk_orders');
    expect(current.indexes[1].name).toBe('idx_orders_name');
    expect(current.indexes[2].name).toBe('uk_orders_email');
  });

  it('应该支持删除索引 removeIndex', () => {
    const state = useIndexStore.getState();
    state.setIndexes([
      { id: '1', name: 'idx_1', fields: [], unique: false },
      { id: '2', name: 'idx_2', fields: [], unique: false },
    ]);
    state.removeIndex('1');

    const current = useIndexStore.getState();
    expect(current.indexes.length).toBe(1);
    expect(current.indexes[0].id).toBe('2');
  });

  it('同步字段重命名时如果参数为空或相同应直接返回', () => {
    const state = useIndexStore.getState();
    state.setCurrentIndexFields([{ name: 'id', direction: 'ASC' }]);

    // missing arg
    state.syncFieldRename('', 'new_id', 'mysql');
    expect(useIndexStore.getState().currentIndexFields[0].name).toBe('id');

    // same arg
    state.syncFieldRename('id', 'id', 'mysql');
    expect(useIndexStore.getState().currentIndexFields[0].name).toBe('id');
  });
});
