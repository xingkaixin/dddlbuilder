import type { TableFolder } from './workspaceStorageTypes';

export type FolderTreeNode = TableFolder & {
  children: FolderTreeNode[];
  tableCount?: number;
};

const childIdsByParent = (folders: readonly TableFolder[]) => {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder.id]);
  }
  return children;
};

export const getFolderDescendantIds = (
  folders: readonly TableFolder[],
  folderId: string,
): string[] => {
  const children = childIdsByParent(folders);
  const descendants: string[] = [];
  const visited = new Set([folderId]);
  const pending = [...(children.get(folderId) ?? [])];

  while (pending.length > 0) {
    const currentId = pending.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    descendants.push(currentId);
    pending.push(...(children.get(currentId) ?? []));
  }

  return descendants;
};

const hasInvalidParent = (foldersById: ReadonlyMap<string, TableFolder>, folder: TableFolder) => {
  if (!folder.parentId || !foldersById.has(folder.parentId)) return Boolean(folder.parentId);
  const visited = new Set([folder.id]);
  let parentId: string | undefined = folder.parentId;
  while (parentId) {
    if (visited.has(parentId)) return true;
    visited.add(parentId);
    parentId = foldersById.get(parentId)?.parentId;
  }
  return false;
};

export const buildFolderTreeModel = (folders: readonly TableFolder[]): FolderTreeNode[] => {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const nodes = new Map<string, FolderTreeNode>(
    folders.map((folder): [string, FolderTreeNode] => [folder.id, { ...folder, children: [] }]),
  );
  const roots: FolderTreeNode[] = [];

  for (const folder of folders) {
    const node = nodes.get(folder.id);
    if (!node) continue;
    if (!folder.parentId || hasInvalidParent(foldersById, folder)) {
      roots.push(node);
      continue;
    }
    nodes.get(folder.parentId)?.children.push(node);
  }

  const sortNodes = (items: FolderTreeNode[]) => {
    items.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    for (const item of items) sortNodes(item.children);
  };
  sortNodes(roots);
  return roots;
};

const nextFolderOrder = (folders: readonly TableFolder[], parentId?: string, excludedId?: string) =>
  folders
    .filter((folder) => folder.parentId === parentId && folder.id !== excludedId)
    .reduce((max, folder) => Math.max(max, folder.order), 0) + 1;

const generateFolderId = () =>
  `folder_${Date.now()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 9)}`;

export const createFolderRecord = (
  folders: readonly TableFolder[],
  name: string,
  parentId?: string,
  options: { id?: string; createdAt?: number } = {},
): TableFolder => {
  return {
    id: options.id ?? generateFolderId(),
    name: name.trim(),
    parentId,
    order: nextFolderOrder(folders, parentId),
    createdAt: options.createdAt ?? Date.now(),
  };
};

export const renameFolderRecord = (folder: TableFolder, name: string): TableFolder => ({
  ...folder,
  name: name.trim(),
});

export const moveFolderRecord = (
  folders: readonly TableFolder[],
  folderId: string,
  parentId?: string,
): TableFolder => {
  const folder = folders.find((item) => item.id === folderId);
  if (!folder) throw new Error('文件夹不存在');
  if (
    parentId &&
    (parentId === folderId || getFolderDescendantIds(folders, folderId).includes(parentId))
  ) {
    throw new Error('不能将文件夹移动到自身或其子文件夹下');
  }
  return {
    ...folder,
    parentId,
    order: nextFolderOrder(folders, parentId, folderId),
  };
};
