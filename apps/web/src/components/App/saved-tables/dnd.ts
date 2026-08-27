import type { UniqueIdentifier } from '@dnd-kit/core';
import type { FolderTreeNode } from '@/hooks/useFolders';

export const ROOT_DROP_ID = 'root';
export const TABLE_DRAG_PREFIX = 'table:';
export const FOLDER_DRAG_PREFIX = 'folder:';

export type FolderParentMap = Record<string, string | undefined>;
export type TableFolderMap = Record<string, string | undefined>;

export type DragEntity = { kind: 'table'; tableId: string } | { kind: 'folder'; folderId: string };

export type DropTarget = { kind: 'root' } | { kind: 'folder'; folderId: string };

export type DropAction =
  | {
      kind: 'none';
      reason: 'searching' | 'missing_target' | 'invalid_target' | 'same_target';
    }
  | {
      kind: 'move_table';
      reason: 'table_relocated';
      tableId: string;
      folderId?: string;
    }
  | {
      kind: 'move_folder';
      reason: 'folder_relocated';
      folderId: string;
      parentId?: string;
    }
  | {
      kind: 'invalid_folder_cycle';
      reason: 'folder_cycle';
      folderId: string;
      parentId: string;
    };

export interface ResolveDropActionInput {
  activeId: UniqueIdentifier;
  overId: UniqueIdentifier | null;
  isSearching: boolean;
  tableFolderMap: TableFolderMap;
  folderParentMap: FolderParentMap;
}

export const toTableDragId = (tableId: string) => `${TABLE_DRAG_PREFIX}${tableId}`;

export const toFolderDragId = (folderId: string) => `${FOLDER_DRAG_PREFIX}${folderId}`;

export function parseDragEntity(id: UniqueIdentifier): DragEntity | null {
  const raw = String(id);
  if (raw.startsWith(TABLE_DRAG_PREFIX)) {
    const tableId = raw.slice(TABLE_DRAG_PREFIX.length);
    if (!tableId) return null;
    return { kind: 'table', tableId };
  }
  if (raw.startsWith(FOLDER_DRAG_PREFIX)) {
    const folderId = raw.slice(FOLDER_DRAG_PREFIX.length);
    if (!folderId) return null;
    return { kind: 'folder', folderId };
  }
  return null;
}

export function parseDropTarget(id: UniqueIdentifier): DropTarget | null {
  const raw = String(id);
  if (raw === ROOT_DROP_ID) {
    return { kind: 'root' };
  }
  if (raw.startsWith(FOLDER_DRAG_PREFIX)) {
    const folderId = raw.slice(FOLDER_DRAG_PREFIX.length);
    if (!folderId) return null;
    return { kind: 'folder', folderId };
  }
  return null;
}

export function buildFolderParentMap(folders: FolderTreeNode[]): FolderParentMap {
  const map: FolderParentMap = {};
  const walk = (nodes: FolderTreeNode[]) => {
    for (const node of nodes) {
      map[node.id] = node.parentId;
      walk(node.children);
    }
  };
  walk(folders);
  return map;
}

export function isFolderMoveToSelfOrDescendant(
  movingFolderId: string,
  targetParentId: string,
  parentMap: FolderParentMap,
): boolean {
  if (movingFolderId === targetParentId) {
    return true;
  }

  let current: string | undefined = targetParentId;
  const visited = new Set<string>();
  while (current) {
    if (current === movingFolderId) {
      return true;
    }
    if (visited.has(current)) {
      return false;
    }
    visited.add(current);
    current = parentMap[current];
  }
  return false;
}

export function resolveDropAction({
  activeId,
  overId,
  isSearching,
  tableFolderMap,
  folderParentMap,
}: ResolveDropActionInput): DropAction {
  if (isSearching) {
    return { kind: 'none', reason: 'searching' };
  }

  if (!overId) {
    return { kind: 'none', reason: 'missing_target' };
  }

  const dragEntity = parseDragEntity(activeId);
  const dropTarget = parseDropTarget(overId);

  if (!dragEntity || !dropTarget) {
    return { kind: 'none', reason: 'invalid_target' };
  }

  if (dragEntity.kind === 'table') {
    const currentFolderId = tableFolderMap[dragEntity.tableId];
    const nextFolderId = dropTarget.kind === 'folder' ? dropTarget.folderId : undefined;

    if (currentFolderId === nextFolderId) {
      return { kind: 'none', reason: 'same_target' };
    }

    return {
      kind: 'move_table',
      reason: 'table_relocated',
      tableId: dragEntity.tableId,
      folderId: nextFolderId,
    };
  }

  const currentParentId = folderParentMap[dragEntity.folderId];
  const nextParentId = dropTarget.kind === 'folder' ? dropTarget.folderId : undefined;

  if (currentParentId === nextParentId) {
    return { kind: 'none', reason: 'same_target' };
  }

  if (
    nextParentId &&
    isFolderMoveToSelfOrDescendant(dragEntity.folderId, nextParentId, folderParentMap)
  ) {
    return {
      kind: 'invalid_folder_cycle',
      reason: 'folder_cycle',
      folderId: dragEntity.folderId,
      parentId: nextParentId,
    };
  }

  return {
    kind: 'move_folder',
    reason: 'folder_relocated',
    folderId: dragEntity.folderId,
    parentId: nextParentId,
  };
}
