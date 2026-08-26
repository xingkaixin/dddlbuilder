import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildFolderTreeModel,
  buildFolderDeletionPlan,
  createFolderRecord,
  findFolderTreeNode,
  getAllFolderTreeNodeIds,
  getFolderDescendantIds,
  getFolderTreeNodeIds,
  moveFolderRecord,
  renameFolderRecord,
} from '@/utils/folderModel';
import type { TableFolder } from '@/utils/savedTablesDb';

const folders: TableFolder[] = [
  { id: 'root', name: 'Root', order: 1, createdAt: 1, updatedAt: 1 },
  { id: 'child', name: 'Child', parentId: 'root', order: 1, createdAt: 2, updatedAt: 2 },
  { id: 'leaf', name: 'Leaf', parentId: 'child', order: 1, createdAt: 3, updatedAt: 3 },
];

describe('folderModel', () => {
  afterEach(() => vi.useRealTimers());

  it('uses the supplied authoritative collection to allocate order', () => {
    expect(
      createFolderRecord(folders, 'Second', 'root', { id: 'second', createdAt: 4 }),
    ).toMatchObject({ id: 'second', parentId: 'root', order: 2 });
  });

  it('rejects moving a folder below itself or a descendant', () => {
    expect(() => moveFolderRecord(folders, 'root', 'root')).toThrow(
      '不能将文件夹移动到自身或其子文件夹下',
    );
    expect(() => moveFolderRecord(folders, 'root', 'leaf')).toThrow(
      '不能将文件夹移动到自身或其子文件夹下',
    );
  });

  it('advances the modification time when renaming or moving a folder', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10);

    expect(renameFolderRecord(folders[0], 'Renamed').updatedAt).toBe(10);
    expect(moveFolderRecord(folders, 'child').updatedAt).toBe(10);
  });

  it('collects descendants once even when stored data contains a cycle', () => {
    const cyclic: TableFolder[] = [
      { id: 'a', name: 'A', parentId: 'b', order: 1, createdAt: 1, updatedAt: 1 },
      { id: 'b', name: 'B', parentId: 'a', order: 1, createdAt: 1, updatedAt: 1 },
    ];

    expect(getFolderDescendantIds(cyclic, 'a')).toEqual(['b']);
    expect(buildFolderTreeModel(cyclic).map((folder) => folder.id)).toEqual(['a', 'b']);
  });

  it('treats folders leading to a cycle or missing parent as roots', () => {
    const invalid: TableFolder[] = [
      { id: 'a', name: 'A', parentId: 'b', order: 1, createdAt: 1, updatedAt: 1 },
      { id: 'b', name: 'B', parentId: 'a', order: 2, createdAt: 1, updatedAt: 1 },
      {
        id: 'before-cycle',
        name: 'Before',
        parentId: 'a',
        order: 3,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'orphan',
        name: 'Orphan',
        parentId: 'missing',
        order: 4,
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    expect(buildFolderTreeModel(invalid).map((folder) => folder.id)).toEqual([
      'a',
      'b',
      'before-cycle',
      'orphan',
    ]);
  });

  it('builds a deep folder chain without recursive traversal', () => {
    const deepFolders = Array.from({ length: 3_000 }, (_, index): TableFolder => ({
      id: `folder-${index}`,
      name: `Folder ${index}`,
      ...(index > 0 ? { parentId: `folder-${index - 1}` } : {}),
      order: 1,
      createdAt: index,
      updatedAt: index,
    }));

    const tree = buildFolderTreeModel(deepFolders);
    let current = tree[0];
    let depth = 0;
    while (current) {
      depth += 1;
      current = current.children[0];
    }

    expect(depth).toBe(3_000);
  });

  it('finds and collects nested tree nodes', () => {
    const tree = buildFolderTreeModel(folders);

    expect(findFolderTreeNode(tree, 'leaf')?.name).toBe('Leaf');
    expect(findFolderTreeNode(tree, 'missing')).toBeNull();
    expect(getFolderTreeNodeIds(tree[0])).toEqual(['root', 'child', 'leaf']);
    expect(getAllFolderTreeNodeIds(tree)).toEqual(['root', 'child', 'leaf']);
  });

  it('builds one deletion plan for folders and active tables', () => {
    expect(
      buildFolderDeletionPlan(
        folders,
        [
          { id: 'active', folderId: 'leaf', updatedAt: 1 },
          { id: 'trashed', folderId: 'child', trashedAt: 2, updatedAt: 2 },
          { id: 'other', updatedAt: 1 },
        ],
        'root',
        10,
      ),
    ).toEqual({
      folderIds: ['root', 'child', 'leaf'],
      tablesToTrash: [{ id: 'active', folderId: 'leaf', trashedAt: 10, updatedAt: 10 }],
    });
  });
});
