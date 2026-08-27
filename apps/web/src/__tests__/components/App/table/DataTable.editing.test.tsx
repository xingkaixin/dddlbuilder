import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@/__tests__/utils/test-utils';
import { DataTable } from '@/components/App/DataTable';
import { useEditorStore } from '@/stores';
import { createEmptyRow } from '@/utils/helpers';

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => children,
  closestCenter: vi.fn(),
  KeyboardSensor: class KeyboardSensor {},
  PointerSensor: class PointerSensor {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => children,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
  sortableKeyboardCoordinates: vi.fn(),
  arrayMove: (array: unknown[], from: number, to: number) => {
    const next = [...array];
    const [target] = next.splice(from, 1);
    if (target === undefined) return next;
    next.splice(to, 0, target);
    return next;
  },
}));

vi.mock('@/components/ui/animated-number', () => ({
  AnimatedNumber: ({ value }: { value: number }) => (
    <span data-testid="animated-number">{String(value)}</span>
  ),
}));

function setupStores() {
  useEditorStore.getState().resetDocument();
  const appState = useEditorStore.getState();
  appState.resetTableConfig();
  appState.resetTableViewConfig();
  appState.setDbType('mysql');

  useEditorStore.getState().setRows([
    {
      id: 'field-id',
      fieldName: 'id',
      fieldComment: '主键',
      fieldType: 'bigint',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ]);

  useEditorStore.getState().resetIndexState();
  useEditorStore.getState().resetPartition();
  useEditorStore.getState().resetCitusSharding();
}

describe('DataTable 单元格编辑切换', () => {
  beforeEach(() => {
    setupStores();
  });

  it('字段改名应在一次文档更新中同步 Hive 分桶和索引引用', () => {
    useEditorStore.setState({
      dbType: 'hive',
      rows: [{ ...createEmptyRow(), fieldName: 'user_id', fieldType: 'BIGINT' }],
      indexes: [
        {
          id: 'idx',
          name: 'idx_user_id',
          fields: [{ name: 'user_id', direction: 'ASC' }],
          unique: false,
        },
      ],
      tableMiscConfig: {
        enabled: true,
        partitions: {
          enabled: true,
          columns: [],
          clustering: { enabled: true, columns: ['user_id'], bucketCount: 4 },
        },
      },
    });
    render(<DataTable />);
    const changes = vi.fn();
    const unsubscribe = useEditorStore.subscribe(changes);
    try {
      fireEvent.doubleClick(screen.getByTitle('user_id'));
      const input = screen.getByDisplayValue('user_id');
      fireEvent.change(input, { target: { value: 'account_id' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      const state = useEditorStore.getState();
      console.info('field rename document result', {
        field: state.rows[0].fieldName,
        clustering: state.tableMiscConfig.partitions?.clustering?.columns,
        notifications: changes.mock.calls.length,
      });
      expect(state.tableMiscConfig.partitions?.clustering?.columns).toEqual(['account_id']);
      expect(state.indexes[0].fields[0].name).toBe('account_id');
      expect(changes).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it('粘贴交换字段名时按原字段身份一次性更新引用', () => {
    const first = { ...createEmptyRow(), fieldName: 'a', fieldType: 'BIGINT' };
    const second = { ...createEmptyRow(), fieldName: 'b', fieldType: 'BIGINT' };
    useEditorStore.setState({
      rows: [first, second],
      indexes: [
        {
          id: 'idx',
          name: 'idx_a_b',
          fields: [
            { name: 'a', direction: 'ASC' },
            { name: 'b', direction: 'DESC' },
          ],
          unique: false,
        },
      ],
      foreignKeys: [
        { id: 'fk', name: 'fk_a', fields: ['a'], refTable: 'other', refFields: ['id'] },
      ],
      mysqlPartitionConfig: {
        enabled: true,
        type: 'HASH',
        columns: [],
        expression: 'a + b + other_a',
      },
    });
    const { container } = render(<DataTable />);
    const cell = container.querySelector('tbody td[data-row-index="0"][data-col-index="1"]');
    if (!cell) throw new Error('Expected the first field name cell');
    fireEvent.pointerDown(cell, { button: 0 });
    const changes = vi.fn();
    const unsubscribe = useEditorStore.subscribe(changes);
    try {
      fireEvent.paste(cell, { clipboardData: { getData: () => 'b\na' } });
      const state = useEditorStore.getState();
      expect(state.rows.map((row) => [row.id, row.fieldName])).toEqual([
        [first.id, 'b'],
        [second.id, 'a'],
      ]);
      expect(state.indexes[0].name).toBe('idx_b_a');
      expect(state.indexes[0].fields.map((field) => field.name)).toEqual(['b', 'a']);
      expect(state.foreignKeys[0].fields).toEqual(['b']);
      expect(state.mysqlPartitionConfig.expression).toBe('b + a + other_a');
      expect(changes).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it('编辑提交时一次点击即可选中目标单元格', async () => {
    const { container } = render(<DataTable />);

    fireEvent.doubleClick(screen.getByTitle('id'));
    const input = screen.getByDisplayValue('id');
    fireEvent.change(input, { target: { value: 'abc' } });

    const commentCell = container.querySelector<HTMLTableCellElement>(
      'tbody td[data-row-index="0"][data-col-index="2"]',
    );
    expect(commentCell).not.toBeNull();
    if (!commentCell) return;

    fireEvent.pointerDown(commentCell, { button: 0 });

    expect(useEditorStore.getState().rows[0].fieldName).toBe('abc');
    expect(commentCell).toHaveClass('ring-2');
    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute('title', '主键');
    });
  });
});
