import type { TableFolder } from './workspaceStorageTypes';

export type FolderTreeNode = TableFolder & {
  children: FolderTreeNode[];
  tableCount?: number;
};

export const findFolderTreeNode = (
  roots: readonly FolderTreeNode[],
  folderId: string,
): FolderTreeNode | null => {
  const pending = [...roots];
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const folder = pending[cursor];
    if (!folder) continue;
    if (folder.id === folderId) return folder;
    pending.push(...folder.children);
  }
  return null;
};

export const getFolderTreeNodeIds = (root: FolderTreeNode): string[] => {
  const ids: string[] = [];
  const pending = [root];
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const folder = pending[cursor];
    if (!folder) continue;
    ids.push(folder.id);
    pending.push(...folder.children);
  }
  return ids;
};

export const getAllFolderTreeNodeIds = (roots: readonly FolderTreeNode[]): string[] => {
  const ids: string[] = [];
  for (const root of roots) ids.push(...getFolderTreeNodeIds(root));
  return ids;
};

export const getFolderDescendantIds = (
  folders: readonly TableFolder[],
  folderId: string,
): string[] => {
  const folder = findFolderTreeNode(buildFolderTreeModel(folders), folderId);
  return folder ? getFolderTreeNodeIds(folder).slice(1) : [];
};

export const buildFolderDeletionPlan = <
  Table extends { folderId?: string; trashedAt?: number; updatedAt: number },
>(
  folders: readonly TableFolder[],
  tables: readonly Table[],
  folderId: string,
  now = Date.now(),
) => {
  const folderIds = [folderId, ...getFolderDescendantIds(folders, folderId)];
  const affected = new Set(folderIds);
  const tablesToTrash = tables
    .filter((table) => table.folderId && affected.has(table.folderId) && !table.trashedAt)
    .map((table) => ({ ...table, trashedAt: now, updatedAt: now }));
  return { folderIds, tablesToTrash };
};

const findInvalidFolderIds = (foldersById: ReadonlyMap<string, TableFolder>) => {
  const invalidIds = new Set<string>();
  const validIds = new Set<string>();

  for (const folder of foldersById.values()) {
    if (invalidIds.has(folder.id) || validIds.has(folder.id)) continue;

    const path: string[] = [];
    const pathIds = new Set<string>();
    let current: TableFolder | undefined = folder;
    let invalid = false;

    while (current) {
      if (invalidIds.has(current.id) || pathIds.has(current.id)) {
        invalid = true;
        break;
      }
      if (validIds.has(current.id)) break;

      path.push(current.id);
      pathIds.add(current.id);
      if (!current.parentId) break;

      current = foldersById.get(current.parentId);
      if (!current) invalid = true;
    }

    const resolvedIds = invalid ? invalidIds : validIds;
    for (const id of path) resolvedIds.add(id);
  }

  return invalidIds;
};

export const buildFolderTreeModel = (folders: readonly TableFolder[]): FolderTreeNode[] => {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const invalidFolderIds = findInvalidFolderIds(foldersById);
  const nodes = new Map<string, FolderTreeNode>(
    folders.map((folder): [string, FolderTreeNode] => [folder.id, { ...folder, children: [] }]),
  );
  const roots: FolderTreeNode[] = [];

  for (const folder of folders) {
    const node = nodes.get(folder.id);
    if (!node) continue;
    if (!folder.parentId || invalidFolderIds.has(folder.id)) {
      roots.push(node);
      continue;
    }
    nodes.get(folder.parentId)?.children.push(node);
  }

  const pendingLevels = [roots];
  while (pendingLevels.length > 0) {
    const items = pendingLevels.pop();
    if (!items) continue;
    items.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    for (const item of items) pendingLevels.push(item.children);
  }
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
  options: { id?: string; createdAt?: number; updatedAt?: number } = {},
): TableFolder => {
  const createdAt = options.createdAt ?? Date.now();
  return {
    id: options.id ?? generateFolderId(),
    name: name.trim(),
    parentId,
    order: nextFolderOrder(folders, parentId),
    createdAt,
    updatedAt: options.updatedAt ?? createdAt,
  };
};

export const renameFolderRecord = (folder: TableFolder, name: string): TableFolder => ({
  ...folder,
  name: name.trim(),
  updatedAt: Date.now(),
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
    updatedAt: Date.now(),
  };
};
