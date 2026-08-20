import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render } from '@/__tests__/utils/test-utils';
import { DataTable } from '@/components/App/DataTable';
import {
  useAppStore,
  useFieldStore,
  useIndexStore,
  usePartitionStore,
  useShardingStore,
} from '@/stores';

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
  const appState = useAppStore.getState();
  appState.resetTableConfig();
  appState.resetTableViewConfig();
  appState.setDbType('mysql');
  appState.setFieldTableFreezeEnabled(true);
  appState.setFieldTableFreezeColumns(3);

  useFieldStore.getState().setRows([
    {
      order: 1,
      fieldName: 'id',
      fieldComment: '主键',
      fieldType: 'bigint',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      order: 2,
      fieldName: 'name',
      fieldComment: '名称',
      fieldType: 'varchar(100)',
      nullable: true,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ]);

  useIndexStore.getState().resetIndexState();
  usePartitionStore.getState().resetPartition();
  useShardingStore.getState().resetCitusSharding();
}

describe('DataTable 冻结列样式', () => {
  beforeEach(() => {
    setupStores();
  });

  it('冻结列单元格应保留行 hover 高亮类，且不使用旧渐变背景', () => {
    const { container } = render(<DataTable />);
    const frozenCell = container.querySelector<HTMLTableCellElement>(
      'tbody td[data-row-index="0"][data-col-index="0"]',
    );

    expect(frozenCell).not.toBeNull();
    if (!frozenCell) return;

    expect(frozenCell).toHaveClass('group-hover/row:bg-muted/30');
    expect(frozenCell.className).not.toContain('group-hover/row:bg-muted/35');
    expect(frozenCell.className).not.toContain('from-background');
    expect(frozenCell.className).not.toContain('to-background/95');
  });

  it('程序高亮命中时，冻结列单元格应展示高亮背景', () => {
    const { container } = render(<DataTable highlightedRowIndex={0} />);
    const frozenCell = container.querySelector<HTMLTableCellElement>(
      'tbody td[data-row-index="0"][data-col-index="0"]',
    );

    expect(frozenCell).not.toBeNull();
    if (!frozenCell) return;

    expect(frozenCell).toHaveClass('bg-blue-500/10');
  });

  it('冻结表头应与普通表头保持一致底色，并移除旧渐变背景', () => {
    const { container } = render(<DataTable />);
    const frozenHeader =
      container.querySelector<HTMLTableHeaderCellElement>('thead th:first-child');

    expect(frozenHeader).not.toBeNull();
    if (!frozenHeader) return;

    expect(frozenHeader).toHaveClass('bg-muted/30');
    expect(frozenHeader.className).not.toContain('from-background');
    expect(frozenHeader.className).not.toContain('to-background/95');
  });
});
