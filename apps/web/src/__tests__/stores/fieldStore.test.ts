import { beforeEach, describe, expect, it } from 'vitest';
import type { FieldRow } from '@ddlbuilder/shared-types';
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

  it('应该处理单元格变更并应用 defaultKind 规则', () => {
    const state = useEditorStore.getState();
    state.setRows([createEmptyRow(0)]);

    state.handleRowsChange(
      [
        [0, 'fieldName', '', 'id'],
        [0, 'defaultKind', 'none', 'auto_increment'],
      ],
      'edit',
    );

    const current = useEditorStore.getState();
    expect(current.rows[0].fieldName).toBe('id');
    expect(current.rows[0].defaultKind).toBe('auto_increment');
    expect(current.rows[0].nullable).toBe(false);
    expect(current.rows[0].defaultValue).toBe('');
  });

  it('应该标准化持久化行并移除历史顺序字段', () => {
    const state = useEditorStore.getState();

    state.initializeRows([
      {
        order: 99,
        fieldName: 123 as unknown as string,
        fieldType: 'varchar(20)',
        fieldComment: null as unknown as string,
        nullable: false as unknown as string,
        defaultKind: 'none',
        defaultValue: undefined as unknown as string,
        onUpdate: 'none',
      },
    ]);

    const current = useEditorStore.getState();
    expect(current.rows).toEqual([
      {
        id: 'legacy-field-0',
        fieldName: '123',
        fieldType: 'varchar(20)',
        fieldComment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ]);
  });

  it('初始化历史格式的行时应归一化而不是丢弃枚举值', () => {
    useEditorStore.getState().initializeRows([
      {
        id: 'field-id',
        order: 1,
        fieldName: 'id',
        fieldType: 'bigint',
        fieldComment: '主键',
        nullable: '否',
        defaultKind: '自增',
        defaultValue: '',
        onUpdate: '当前时间',
      },
    ] as unknown as FieldRow[]);

    expect(useEditorStore.getState().rows[0]).toMatchObject({
      nullable: false,
      defaultKind: 'auto_increment',
      onUpdate: 'current_timestamp',
    });
  });

  it('空初始化与无效变更应保持数据不变', () => {
    const state = useEditorStore.getState();
    const emptyRow = createEmptyRow(0);
    state.setRows([emptyRow]);

    state.initializeRows([]);
    state.initializeRows(undefined);
    state.handleRowsChange(null, 'edit');
    state.handleRowsChange([[0, 'fieldName', '', 'name']], 'loadData');
    state.handleRowsChange([null], 'edit');

    const current = useEditorStore.getState();
    expect(current.rows).toEqual([emptyRow]);
  });

  it('应该扩容到目标行并处理默认值规则', () => {
    const state = useEditorStore.getState();
    state.setRows([createEmptyRow(0)]);

    state.handleRowsChange(
      [
        [2, 'fieldName', '', 'status'],
        [2, 'defaultValue', '', '1'],
        [2, 'defaultKind', 'none', 'uuid'],
      ],
      'edit',
    );

    const current = useEditorStore.getState();
    expect(current.rows.length).toBe(3);
    expect(current.rows[2].id).toEqual(expect.any(String));
    expect(current.rows[2].fieldName).toBe('status');
    expect(current.rows[2].defaultKind).toBe('uuid');
    expect(current.rows[2].defaultValue).toBe('');
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
          unique: false,
        },
        {
          id: 'removed-index',
          name: 'idx_users_user_id',
          fields: [{ name: 'user_id', direction: 'ASC' }],
          unique: false,
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

  it('应该处理 normalizeNullableValue 与 handleRowsChange 异常 prop 边界', () => {
    const state = useEditorStore.getState();

    state.initializeRows([{ ...createEmptyRow(0), nullable: false as any }]);

    expect(useEditorStore.getState().rows[0].nullable).toBe(false);

    useEditorStore.getState().handleRowsChange(
      [
        [0, 123 as any, '', 'ignored'],
        [0, 'order', 1, 2],
      ],
      'edit',
    );

    expect(useEditorStore.getState().rows[0]).not.toHaveProperty('order');
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
