import { assert, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { listWorkspaceFolders, upsertWorkspaceFolder } from '@ddlbuilder/workspace-core';
import {
  buildFolderTreeModel,
  buildFolderDeletionPlan,
  findFolderTreeNode,
  getFolderTreeNodeIds,
  moveFolderRecord,
} from '@/utils/folderModel';
import type { TableFolder } from '@/utils/workspaceStorageTypes';

const folders: TableFolder[] = [
  { id: 'root', name: 'Root', order: 1, createdAt: 1, updatedAt: 1 },
  { id: 'child', name: 'Child', parentId: 'root', order: 1, createdAt: 2, updatedAt: 2 },
  { id: 'leaf', name: 'Leaf', parentId: 'child', order: 1, createdAt: 3, updatedAt: 3 },
];

describe('folderModel', () => {
  it('rejects moving a folder below itself or a descendant', () => {
    expect(() => moveFolderRecord(folders, 'root', 'root')).toThrow(
      '不能将文件夹移动到自身或其子文件夹下',
    );
    expect(() => moveFolderRecord(folders, 'root', 'leaf')).toThrow(
      '不能将文件夹移动到自身或其子文件夹下',
    );
  });

  it('matches the displayed deletion scope after concurrent folder moves', () => {
    const original = new Y.Doc();
    const left = new Y.Doc();
    const right = new Y.Doc();

    try {
      for (const id of ['a', 'b']) {
        upsertWorkspaceFolder(original, {
          id,
          name: id,
          order: 1,
          createdAt: 1,
          updatedAt: 1,
        });
      }

      const seed = Y.encodeStateAsUpdate(original);
      Y.applyUpdate(left, seed);
      Y.applyUpdate(right, seed);
      upsertWorkspaceFolder(left, moveFolderRecord(listWorkspaceFolders(left), 'a', 'b'));
      upsertWorkspaceFolder(right, moveFolderRecord(listWorkspaceFolders(right), 'b', 'a'));
      Y.applyUpdate(left, Y.encodeStateAsUpdate(right));

      const merged = listWorkspaceFolders(left);
      const tree = buildFolderTreeModel(merged);
      const displayedFolder = findFolderTreeNode(tree, 'a');
      assert(displayedFolder, 'Folder A must be present in the displayed tree');
      const displayedIds = getFolderTreeNodeIds(displayedFolder);

      const plan = buildFolderDeletionPlan(
        merged,
        ['a', 'b'].map((id) => ({ id: `table-${id}`, folderId: id, updatedAt: 1 })),
        'a',
        10,
      );
      console.info('folder deletion scope after concurrent moves', {
        displayedIds,
        deletedIds: plan.folderIds,
        trashedTableIds: plan.itemsToTrash.map((table) => table.id),
      });

      expect(tree.map((folder) => folder.id)).toEqual(['a', 'b']);
      expect(plan.folderIds).toEqual(displayedIds);
      expect(plan.itemsToTrash.map((table) => table.id)).toEqual(['table-a']);
    } finally {
      original.destroy();
      left.destroy();
      right.destroy();
    }
  });

  it('builds one deletion plan for active folder contents', () => {
    expect(
      buildFolderDeletionPlan(
        folders,
        [
          { id: 'active', folderId: 'leaf', updatedAt: 1 },
          { id: 'trashed', folderId: 'child', trashedAt: 0, updatedAt: 2 },
          { id: 'other', updatedAt: 1 },
        ],
        'root',
        10,
      ),
    ).toEqual({
      folderIds: ['root', 'child', 'leaf'],
      itemsToTrash: [{ id: 'active', folderId: 'leaf', trashedAt: 10, updatedAt: 10 }],
    });
  });
});
