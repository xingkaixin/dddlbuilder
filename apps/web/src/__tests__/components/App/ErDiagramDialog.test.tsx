import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/__tests__/utils/test-utils';
import { ErDiagramDialog } from '@/components/App/ErDiagramDialog';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/components/App/er-diagram/ErDiagramCanvas', () => ({
  default: ({ tables }: { tables: SavedTableRecord[] }) => (
    <div data-testid="er-table-count">{tables.length}</div>
  ),
}));

const record: SavedTableRecord = {
  normalizedName: 'users',
  name: 'Users',
  state: {
    schemaName: '',
    tableName: 'users',
    tableComment: '',
    dbType: 'mysql',
    sqlFormatMode: 'compact',
    rows: [],
    addCount: 1,
    indexInput: '',
    currentIndexFields: [],
    indexes: [],
    authInput: '',
    authObjects: [],
  },
  createdAt: 1,
  updatedAt: 1,
};

describe('ErDiagramDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('通过调用方提供的 workspace 读取入口加载表', async () => {
    const loadTables = vi.fn().mockResolvedValue([record]);

    render(
      <ErDiagramDialog
        open
        onOpenChange={vi.fn()}
        onSelectTable={vi.fn()}
        saveTable={vi.fn()}
        overwriteTable={vi.fn()}
        loadTables={loadTables}
      />,
    );

    await waitFor(() => expect(loadTables).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('er-table-count')).toHaveTextContent('1');
  });
});
