import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@/__tests__/utils/test-utils';
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
  ]);

  useIndexStore.getState().resetIndexState();
  usePartitionStore.getState().resetPartition();
  useShardingStore.getState().resetCitusSharding();
}

describe('DataTable 单元格编辑切换', () => {
  beforeEach(() => {
    setupStores();
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

    expect(useFieldStore.getState().rows[0].fieldName).toBe('abc');
    expect(commentCell).toHaveClass('ring-2');
    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute('title', '主键');
    });
  });
});
