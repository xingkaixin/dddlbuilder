import { describe, expect, it } from 'vitest';
import type { FolderTreeNode } from '@/hooks/useFolders';
import {
  ROOT_DROP_ID,
  buildFolderParentMap,
  resolveDropAction,
  toFolderDragId,
  toTableDragId,
  parseDragEntity,
  parseDropTarget,
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

  it('表拖到文件夹应返回 move_table', () => {
    const action = resolveDropAction({
      activeId: toTableDragId('users'),
      overId: toFolderDragId('root-a'),
      isSearching: false,
      tableFolderMap: { users: undefined },
      folderParentMap,
    });

    expect(action).toEqual({
      kind: 'move_table',
      reason: 'table_relocated',
      tableId: 'users',
      folderId: 'root-a',
    });
  });

  it('表拖到根级应返回 move_table + undefined folder', () => {
    const action = resolveDropAction({
      activeId: toTableDragId('users'),
      overId: ROOT_DROP_ID,
      isSearching: false,
      tableFolderMap: { users: 'root-a' },
      folderParentMap,
    });

    expect(action).toEqual({
      kind: 'move_table',
      reason: 'table_relocated',
      tableId: 'users',
      folderId: undefined,
    });
  });

  it('表拖到原文件夹应返回 none', () => {
    const action = resolveDropAction({
      activeId: toTableDragId('users'),
      overId: toFolderDragId('root-a'),
      isSearching: false,
      tableFolderMap: { users: 'root-a' },
      folderParentMap,
    });

    expect(action).toEqual({ kind: 'none', reason: 'same_target' });
  });

  it('文件夹拖到另一个文件夹应返回 move_folder', () => {
    const action = resolveDropAction({
      activeId: toFolderDragId('child-a-1'),
      overId: toFolderDragId('root-b'),
      isSearching: false,
      tableFolderMap: {},
      folderParentMap,
    });

    expect(action).toEqual({
      kind: 'move_folder',
      reason: 'folder_relocated',
      folderId: 'child-a-1',
      parentId: 'root-b',
    });
  });

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

  it('搜索中应禁用拖拽移动', () => {
    const action = resolveDropAction({
      activeId: toTableDragId('users'),
      overId: toFolderDragId('root-a'),
      isSearching: true,
      tableFolderMap: { users: undefined },
      folderParentMap,
    });

    expect(action).toEqual({ kind: 'none', reason: 'searching' });
  });

  it('如果没有 overId 应返回 missing_target', () => {
    const action = resolveDropAction({
      activeId: toTableDragId('users'),
      overId: null,
      isSearching: false,
      tableFolderMap: { users: undefined },
      folderParentMap,
    });
    expect(action).toEqual({ kind: 'none', reason: 'missing_target' });
  });

  it('如果 activeId 或 overId 无法解析为有效实体应返回 invalid_target', () => {
    const action = resolveDropAction({
      activeId: 'random-invalid-draggable-id',
      overId: ROOT_DROP_ID,
      isSearching: false,
      tableFolderMap: {},
      folderParentMap,
    });
    expect(action).toEqual({ kind: 'none', reason: 'invalid_target' });
  });

  it('文件夹拖到当前的父级中应返回 same_target', () => {
    const action = resolveDropAction({
      activeId: toFolderDragId('child-a-1'),
      overId: toFolderDragId('root-a'),
      isSearching: false,
      tableFolderMap: {},
      folderParentMap,
    });
    expect(action).toEqual({ kind: 'none', reason: 'same_target' });
  });

  it('DragEntity 识别异常测试', () => {
    expect(parseDragEntity('invalid:')).toBeNull();
    expect(parseDragEntity('table:')).toBeNull(); // empty name
    expect(parseDragEntity('folder:')).toBeNull(); // empty name
  });

  it('DropTarget 识别异常测试', () => {
    expect(parseDropTarget('invalid:')).toBeNull();
    expect(parseDropTarget('folder:')).toBeNull(); // empty name
  });
});
