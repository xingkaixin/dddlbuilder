import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores';
import { createEmptyRow } from '@/utils/helpers';
import { buildDuplicateNameSet, buildNormalizedFields } from '@/stores/fieldStore';

function resetFieldStore() {
  useEditorStore.getState().resetRows(12);
}

describe('fieldStore', () => {
  beforeEach(() => {
    resetFieldStore();
  });

  it('应该支持增删行并保持数组顺序', () => {
    const state = useEditorStore.getState();

    state.handleAddRows(2);
    let current = useEditorStore.getState();
    expect(current.rows.length).toBe(14);
    const fourthRowId = current.rows[3].id;

    state.handleRemoveRow(0, 3);
    current = useEditorStore.getState();
    expect(current.rows.length).toBe(11);
    expect(current.rows[0].id).toBe(fourthRowId);
  });

  it('删除全部行后至少保留一行，非法新增数量按 1 处理', () => {
    const state = useEditorStore.getState();
    state.resetRows(1);

    state.handleRemoveRow(0, 1);
    let current = useEditorStore.getState();
    expect(current.rows.length).toBe(1);
    expect(current.rows[0].id).toEqual(expect.any(String));

    state.handleAddRows(0);
    current = useEditorStore.getState();
    expect(current.rows.length).toBe(2);
  });

  it('删除字段时应同时清理文档内的字段引用', () => {
    const idRow = { ...createEmptyRow(0), fieldName: 'id' };
    const userIdRow = { ...createEmptyRow(1), fieldName: 'user_id' };
    useEditorStore.setState({
      rows: [idRow, userIdRow],
      currentIndexFields: [
        { name: 'id', direction: 'ASC' },
        { name: 'user_id', direction: 'ASC' },
      ],
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
    expect(current.currentIndexFields).toEqual([{ name: 'id', direction: 'ASC' }]);
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

  it('应该支持中间插入行 handleCreateRow', () => {
    const state = useEditorStore.getState();
    state.resetRows(2);

    let current = useEditorStore.getState();
    expect(current.rows.length).toBe(2);

    state.handleCreateRow(1, 2);
    current = useEditorStore.getState();
    expect(current.rows.length).toBe(4);
    expect(current.rows[1].id).not.toBe(current.rows[2].id);
  });
});

describe('fieldStore helpers', () => {
  it('应该识别重复字段名并规范化字段结构', () => {
    const rows = [
      {
        ...createEmptyRow(0),
        fieldName: ' id ',
        fieldType: 'int',
        nullable: false,
      },
      {
        ...createEmptyRow(1),
        fieldName: 'id',
        fieldType: 'varchar(20)',
        nullable: true,
        defaultKind: 'constant',
        defaultValue: 'abc',
      },
      {
        ...createEmptyRow(2),
        fieldName: '',
        fieldType: '',
      },
    ];

    const duplicates = buildDuplicateNameSet(rows);
    expect(duplicates.has('id')).toBe(true);

    const normalized = buildNormalizedFields(rows);
    expect(normalized).toEqual([
      {
        name: 'id',
        type: 'int',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'id',
        type: 'varchar(20)',
        comment: '',
        nullable: true,
        defaultKind: 'constant',
        defaultValue: 'abc',
        onUpdate: 'none',
      },
    ]);
  });
});
