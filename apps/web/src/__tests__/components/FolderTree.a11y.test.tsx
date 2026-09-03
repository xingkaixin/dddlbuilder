import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/__tests__/utils/test-utils';
import { createFolderTreeNode } from '@/__tests__/utils/testFactories';
import { FolderTree } from '@/components/App/FolderTree';
import type { FolderTreeNode } from '@/hooks/useFolders';

const now = Date.now();

const folders: FolderTreeNode[] = [
  createFolderTreeNode('folder-root', {
    name: '业务表',
    parentId: undefined,
    order: 0,
    createdAt: now,
    tableCount: 1,
    children: [
      createFolderTreeNode('folder-child', {
        name: '归档表',
        parentId: 'folder-root',
        order: 0,
        createdAt: now,
        tableCount: 1,
      }),
    ],
  }),
];

describe('FolderTree a11y', () => {
  it('应提供 tree/treeitem/group 语义以及展开层级信息', () => {
    render(
      <FolderTree
        folders={folders}
        expandedFolders={new Set(['folder-root', 'folder-child'])}
        selectedFolderId="folder-root"
        onToggleFolder={vi.fn()}
        onSelectFolder={vi.fn()}
        onCreateFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
        renderTables={(folderId, depth = 0) => {
          if (!folderId) return null;
          return (
            <div
              data-testid={`folder-table-container:${folderId}`}
              style={{ marginLeft: `${(depth + 1) * 16}px` }}
            />
          );
        }}
      />,
    );

    expect(screen.getByRole('tree', { name: '保存的表文件夹' })).toBeInTheDocument();

    const rootItem = screen.getByText('业务表').closest('[role="treeitem"]');
    expect(rootItem).not.toBeNull();
    expect(rootItem).toHaveAttribute('aria-level', '1');
    expect(rootItem).toHaveAttribute('aria-expanded', 'true');
    expect(rootItem).toHaveAttribute('aria-selected', 'true');

    const childItem = screen.getByText('归档表').closest('[role="treeitem"]');
    expect(childItem).not.toBeNull();
    expect(childItem).toHaveAttribute('aria-level', '2');

    expect(
      screen.getByTestId('folder-table-container:folder-root').getAttribute('style'),
    ).toContain('margin-left: 16px');
    expect(
      screen.getByTestId('folder-table-container:folder-child').getAttribute('style'),
    ).toContain('margin-left: 32px');

    expect(screen.getByRole('button', { name: '折叠 业务表' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '拖拽移动文件夹' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('group').length).toBeGreaterThan(0);
  });
});
