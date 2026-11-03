import { describe, expect, it } from 'vitest';
import type { FolderTreeNode } from '@/hooks/useFolders';
import {
  buildFolderParentMap,
  resolveDropAction,
  toFolderDragId,
} from '@/components/App/saved-tables/dnd';

const now = Date.now();

const folders: FolderTreeNode[] = [
  {
    id: 'root-a',
    name: 'A',
    parentId: undefined,
    order: 1,
    createdAt: now,
    updatedAt: now,
    children: [
      {
        id: 'child-a-1',
        name: 'A-1',
        parentId: 'root-a',
        order: 1,
        createdAt: now,
        updatedAt: now,
        children: [],
      },
    ],
  },
  {
    id: 'root-b',
    name: 'B',
    parentId: undefined,
    order: 2,
    createdAt: now,
    updatedAt: now,
    children: [],
  },
];

describe('saved tables dnd decision', () => {
  const folderParentMap = buildFolderParentMap(folders);

  it('文件夹拖到自身或子孙应被拦截', () => {
    const action = resolveDropAction({
      activeId: toFolderDragId('root-a'),
      overId: toFolderDragId('child-a-1'),
      isSearching: false,
      tableFolderMap: {},
      folderParentMap,
    });

    expect(action).toEqual({
      kind: 'invalid_folder_cycle',
      reason: 'folder_cycle',
      folderId: 'root-a',
      parentId: 'child-a-1',
    });
  });
});
