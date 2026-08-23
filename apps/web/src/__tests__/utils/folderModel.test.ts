import { describe, expect, it } from 'vitest';
import {
  buildFolderTreeModel,
  createFolderRecord,
  getFolderDescendantIds,
  moveFolderRecord,
} from '@/utils/folderModel';
import type { TableFolder } from '@/utils/savedTablesDb';

const folders: TableFolder[] = [
  { id: 'root', name: 'Root', order: 1, createdAt: 1 },
  { id: 'child', name: 'Child', parentId: 'root', order: 1, createdAt: 2 },
  { id: 'leaf', name: 'Leaf', parentId: 'child', order: 1, createdAt: 3 },
];

describe('folderModel', () => {
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

  it('collects descendants once even when stored data contains a cycle', () => {
    const cyclic: TableFolder[] = [
      { id: 'a', name: 'A', parentId: 'b', order: 1, createdAt: 1 },
      { id: 'b', name: 'B', parentId: 'a', order: 1, createdAt: 1 },
    ];

    expect(getFolderDescendantIds(cyclic, 'a')).toEqual(['b']);
    expect(buildFolderTreeModel(cyclic).map((folder) => folder.id)).toEqual(['a', 'b']);
  });
});
