import { describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores';
import { createFieldRow } from '@/__tests__/utils/testFactories';

describe('fieldStore', () => {
  it('删除字段时应同时清理文档内的字段引用', () => {
    const idRow = createFieldRow('field-id');
    const userIdRow = createFieldRow('field-user-id', { fieldName: 'user_id' });
    useEditorStore.setState({
      rows: [idRow, userIdRow],
      indexes: [
        {
          id: 'kept-index',
          name: 'idx_users_id',
          fields: [{ name: 'id', direction: 'ASC' }],
          kind: 'index',
        },
        {
          id: 'removed-index',
          name: 'idx_users_user_id',
          fields: [{ name: 'user_id', direction: 'ASC' }],
          kind: 'index',
        },
      ],
      foreignKeys: [
        {
          id: 'removed-fk',
          name: 'fk_users_user',
          fields: ['user_id'],
          refTable: 'accounts',
          refFields: ['id'],
        },
      ],
      mysqlPartitionConfig: {
        enabled: true,
        type: 'HASH',
        columns: [],
        expression: 'YEAR(user_id)',
      },
      citusShardingConfig: { mode: 'distributed', distributionColumn: 'user_id' },
      tableMiscConfig: {
        enabled: true,
        partitions: {
          enabled: true,
          columns: [],
          clustering: { enabled: true, columns: ['id', 'user_id'], bucketCount: 4 },
        },
      },
    });

    useEditorStore.getState().handleRemoveRow(1, 1);

    const current = useEditorStore.getState();
    expect(current.rows).toEqual([idRow]);
    expect(current.indexes.map((index) => index.id)).toEqual(['kept-index']);
    expect(current.foreignKeys).toEqual([]);
    expect(current.mysqlPartitionConfig).toMatchObject({ enabled: false, columns: [] });
    expect(current.mysqlPartitionConfig.expression).toBeUndefined();
    expect(current.citusShardingConfig).toEqual({
      mode: 'reference',
      distributionColumn: undefined,
    });
    expect(current.tableMiscConfig.partitions?.clustering).toMatchObject({
      enabled: true,
      columns: ['id'],
    });
  });
});
