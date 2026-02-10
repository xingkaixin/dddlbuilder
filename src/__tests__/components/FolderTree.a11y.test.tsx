import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/__tests__/utils/test-utils';
import { FolderTree } from '@/components/App/FolderTree';
import type { FolderTreeNode } from '@/hooks/useFolders';

const now = Date.now();

const folders: FolderTreeNode[] = [
  {
    id: 'folder-root',
    name: '业务表',
    parentId: undefined,
    order: 0,
    createdAt: now,
    tableCount: 1,
    children: [
      {
        id: 'folder-child',
        name: '归档表',
        parentId: 'folder-root',
        order: 0,
        createdAt: now,
        tableCount: 0,
        children: [],
      },
    ],
  },
];

describe('FolderTree a11y', () => {
  it('应提供 tree/treeitem/group 语义以及展开层级信息', () => {
    render(
      <FolderTree
        folders={folders}
        expandedFolders={new Set(['folder-root'])}
        selectedFolderId="folder-root"
        onToggleFolder={vi.fn()}
        onSelectFolder={vi.fn()}
        onCreateFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
        renderTables={() => null}
      />,
    );

    expect(
      screen.getByRole('tree', { name: '保存的表文件夹' }),
    ).toBeInTheDocument();

    const rootItem = screen.getByText('业务表').closest('[role="treeitem"]');
    expect(rootItem).not.toBeNull();
    expect(rootItem).toHaveAttribute('aria-level', '1');
    expect(rootItem).toHaveAttribute('aria-expanded', 'true');
    expect(rootItem).toHaveAttribute('aria-selected', 'true');

    const childItem = screen.getByText('归档表').closest('[role="treeitem"]');
    expect(childItem).not.toBeNull();
    expect(childItem).toHaveAttribute('aria-level', '2');

    expect(
      screen.getByRole('button', { name: '折叠 业务表' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group')).toBeInTheDocument();
  });
});
