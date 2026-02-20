import { describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@/__tests__/utils/test-utils';
import { TableItem } from '@/components/App/saved-tables/TableItem';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { LocaleProvider } from '@/i18n/LocaleContext';

vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
  }),
}));

const item: SavedTableSummary = {
  normalizedName: 'users',
  name: 'users',
  dbType: 'mysql',
  fieldCount: 5,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

describe('TableItem', () => {
  it('应渲染表图标和主信息及附属元信息', () => {
    render(
      <LocaleProvider>
        <TableItem
          item={item}
          isActive={false}
          activeDirty={false}
          onSelect={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('table-icon:users')).toBeInTheDocument();
    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByText('mysql')).toBeInTheDocument();
    expect(screen.getByText(/5\s*(字段|fields)/)).toBeInTheDocument();
    expect(
      screen.getByText(/(更新|Updated)\s*\d{1,2}[./-]\d{1,2}/),
    ).toBeInTheDocument();
  });

  it('应渲染展开位占位且不影响点击选择', async () => {
    const onSelect = vi.fn();

    render(
      <LocaleProvider>
        <TableItem
          item={item}
          isActive={false}
          activeDirty={false}
          onSelect={onSelect}
          onRename={vi.fn()}
          onDelete={vi.fn()}
        />
      </LocaleProvider>,
    );

    const row = screen.getByTestId('saved-table-row:users');
    const dragHandle = screen.getByTestId('drag-handle-table:users');
    const placeholder = screen.getByTestId('table-expand-placeholder:users');
    const metaRow = screen.getByTestId('table-meta-row:users');
    const actionMask = screen.getByTestId('table-actions-mask:users');
    const actions = screen.getByTestId('table-actions:users');
    const titleRow = screen.getByTestId('table-icon:users').parentElement;

    expect(row.firstChild).toBe(dragHandle);
    expect(dragHandle.nextSibling).toBe(placeholder);
    expect(row).toHaveClass('relative', 'gap-1');
    expect(dragHandle).toHaveClass('h-5', 'w-5');
    expect(dragHandle).not.toHaveClass('mr-1');
    expect(placeholder).toHaveClass('h-5', 'w-5');
    expect(placeholder).not.toHaveClass('mr-1');
    expect(metaRow).toHaveClass('whitespace-nowrap');
    expect(actionMask).toHaveClass('absolute', 'opacity-80');
    expect(actionMask).toHaveClass(
      'group-hover:opacity-100',
      'group-focus-within:opacity-100',
    );
    expect(actions).toHaveClass('absolute', 'opacity-70');
    expect(actions).not.toHaveClass('pointer-events-none');
    expect(actions).toHaveClass('group-hover:opacity-100');
    expect(titleRow).not.toBeNull();
    expect(titleRow).toHaveClass('gap-1');

    await userEvent.click(screen.getByRole('button', { name: /users/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
