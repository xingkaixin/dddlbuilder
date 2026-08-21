import { act, render, screen } from '@/__tests__/utils/test-utils';
import { SavedTablesDrawer } from '@/components/App/SavedTablesDrawer';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { LocaleProvider } from '@/i18n/LocaleContext';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let latestOnDragEnd: ((event: any) => void | Promise<void>) | undefined;

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode;
    onDragEnd?: (event: any) => void | Promise<void>;
  }) => {
    latestOnDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  PointerSensor: class {},
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
  useSensor: () => ({}),
  useSensors: (...sensors: unknown[]) => sensors,
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
  }),
}));

vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerClose: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function createBaseProps() {
  return {
    open: true,
    loading: false,
    error: null,
    items: [] as SavedTableSummary[],
    folders: [] as FolderTreeNode[],
    onOpenChange: vi.fn(),
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };
}

describe('SavedTablesDrawer', () => {
  beforeEach(() => {
    latestOnDragEnd = undefined;
  });

  it('空状态应显示可见但禁用的搜索框', () => {
    render(
      <LocaleProvider>
        <SavedTablesDrawer {...createBaseProps()} />
      </LocaleProvider>,
    );

    const searchInput = screen.getByTestId('saved-tables-search');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toBeDisabled();
    expect(screen.getByText('暂无可搜索内容，先保存一个表即可使用搜索。')).toBeInTheDocument();
  });

  it('非法文件夹循环拖拽应阻断移动并显示反馈', async () => {
    const onMoveFolder = vi.fn();
    const folders: FolderTreeNode[] = [
      {
        id: 'root-a',
        name: 'A',
        parentId: undefined,
        order: 1,
        createdAt: Date.now(),
        children: [
          {
            id: 'child-a-1',
            name: 'A-1',
            parentId: 'root-a',
            order: 1,
            createdAt: Date.now(),
            children: [],
          },
        ],
      },
    ];

    const items: SavedTableSummary[] = [
      {
        normalizedName: 'users',
        name: 'Users',
        dbType: 'mysql',
        fieldCount: 3,
        folderId: 'root-a',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    render(
      <LocaleProvider>
        <SavedTablesDrawer
          {...createBaseProps()}
          folders={folders}
          items={items}
          onMoveFolder={onMoveFolder}
        />
      </LocaleProvider>,
    );

    expect(latestOnDragEnd).toBeTypeOf('function');

    await act(async () => {
      await latestOnDragEnd?.({
        active: { id: 'folder:root-a' },
        over: { id: 'folder:child-a-1' },
      });
    });

    expect(onMoveFolder).not.toHaveBeenCalled();
    expect(
      screen.getByText('不能将文件夹移动到自身或子文件夹，请选择其他目标目录。'),
    ).toBeInTheDocument();
  });

  it('应将表拖拽移动交给共享树控制逻辑', async () => {
    const onMoveToFolder = vi.fn().mockResolvedValue({ ok: true });
    const folder: FolderTreeNode = {
      id: 'folder-a',
      name: 'A',
      parentId: undefined,
      order: 1,
      createdAt: Date.now(),
      children: [],
    };
    const item: SavedTableSummary = {
      normalizedName: 'users',
      name: 'Users',
      dbType: 'mysql',
      fieldCount: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(
      <LocaleProvider>
        <SavedTablesDrawer
          {...createBaseProps()}
          folders={[folder]}
          items={[item]}
          onMoveToFolder={onMoveToFolder}
        />
      </LocaleProvider>,
    );

    await act(async () => {
      await latestOnDragEnd?.({
        active: { id: 'table:users' },
        over: { id: 'folder:folder-a' },
      });
    });

    expect(onMoveToFolder).toHaveBeenCalledWith(item, 'folder-a');
  });
});
