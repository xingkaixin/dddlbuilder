import { beforeEach, describe, expect, it } from 'vitest';
import type { FieldRow } from '@ddlbuilder/shared-types';
import { useFieldStore } from '@/stores';
import { createEmptyRow } from '@/utils/helpers';
import { buildDuplicateNameSet, buildNormalizedFields } from '@/stores/fieldStore';

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
        [0, 'defaultKind', 'none', 'auto_increment'],
      ],
      'edit',
    );

    const current = useFieldStore.getState();
    expect(current.rows[0].fieldName).toBe('id');
    expect(current.rows[0].defaultKind).toBe('auto_increment');
    expect(current.rows[0].nullable).toBe(false);
    expect(current.rows[0].defaultValue).toBe('');
  });

  it('应该标准化持久化行并重新编号', () => {
    const state = useFieldStore.getState();

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

    const current = useFieldStore.getState();
    expect(current.rows).toEqual([
      {
        id: 'legacy-field-0',
        order: 1,
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
    useFieldStore.getState().initializeRows([
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

    expect(useFieldStore.getState().rows[0]).toMatchObject({
      nullable: false,
      defaultKind: 'auto_increment',
      onUpdate: 'current_timestamp',
    });
  });

  it('空初始化与无效变更应保持数据不变', () => {
    const state = useFieldStore.getState();
    const emptyRow = createEmptyRow(0);
    state.setRows([emptyRow]);

    state.initializeRows([]);
    state.initializeRows(undefined);
    state.handleRowsChange(null, 'edit');
    state.handleRowsChange([[0, 'fieldName', '', 'name']], 'loadData');
    state.handleRowsChange([null], 'edit');

    const current = useFieldStore.getState();
    expect(current.rows).toEqual([emptyRow]);
  });

  it('应该扩容到目标行并处理默认值规则', () => {
    const state = useFieldStore.getState();
    state.setRows([createEmptyRow(0)]);

    state.handleRowsChange(
      [
        [2, 'fieldName', '', 'status'],
        [2, 'defaultValue', '', '1'],
        [2, 'defaultKind', 'none', 'uuid'],
      ],
      'edit',
    );

    const current = useFieldStore.getState();
    expect(current.rows.length).toBe(3);
    expect(current.rows[2].order).toBe(3);
    expect(current.rows[2].fieldName).toBe('status');
    expect(current.rows[2].defaultKind).toBe('uuid');
    expect(current.rows[2].defaultValue).toBe('');
  });

  it('删除全部行后至少保留一行，非法新增数量按 1 处理', () => {
    const state = useFieldStore.getState();
    state.resetRows(1);

    state.handleRemoveRow(0, 1);
    let current = useFieldStore.getState();
    expect(current.rows.length).toBe(1);
    expect(current.rows[0].order).toBe(1);

    state.handleAddRows(0);
    current = useFieldStore.getState();
    expect(current.rows.length).toBe(2);
  });

  it('应该支持中间插入行 handleCreateRow', () => {
    const state = useFieldStore.getState();
    state.resetRows(2);

    let current = useFieldStore.getState();
    expect(current.rows.length).toBe(2);

    state.handleCreateRow(1, 2);
    current = useFieldStore.getState();
    expect(current.rows.length).toBe(4);
    expect(current.rows[1].order).toBe(2);
    expect(current.rows[2].order).toBe(3);
  });

  it('应该处理 normalizeNullableValue 与 handleRowsChange 异常 prop 边界', () => {
    const state = useFieldStore.getState();

    state.initializeRows([{ ...createEmptyRow(0), nullable: false as any }]);

    expect(useFieldStore.getState().rows[0].nullable).toBe(false);

    useFieldStore.getState().handleRowsChange(
      [
        [0, 123 as any, '', 'ignored'],
        [0, 'order', 1, 2],
      ],
      'edit',
    );

    expect(useFieldStore.getState().rows[0].order).toBe(1);
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
