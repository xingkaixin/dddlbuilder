import { openDb, FOLDER_STORE_NAME, type TableFolder } from './savedTablesDb';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import {
  buildScopedWorkspaceKey,
  getAnonymousWorkspaceScope,
  getWorkspaceScopeStorageKey,
} from './workspaceScope';
import { runIndexedDbRequest } from './indexedDbTransaction';

const LEGACY_SCOPE = getWorkspaceScopeStorageKey(getAnonymousWorkspaceScope());

const withScopeKey = (scope: WorkspaceScope, id: string) => buildScopedWorkspaceKey(scope, id);

const decodeScopedFolder = (folder: TableFolder, scope: WorkspaceScope): TableFolder | null => {
  const scopeKey = getWorkspaceScopeStorageKey(scope);
  if (folder.scope && folder.scope !== scopeKey) {
    return null;
  }

  if (folder.id.includes('::')) {
    const prefix = `${scopeKey}::`;
    if (!folder.id.startsWith(prefix)) {
      return null;
    }
    return {
      ...folder,
      id: folder.id.slice(prefix.length),
      scope: scopeKey,
    };
  }

  if (scope.kind !== 'anonymous') {
    return null;
  }

  return {
    ...folder,
    scope: LEGACY_SCOPE,
  };
};

const encodeFolder = (folder: TableFolder, scope: WorkspaceScope): TableFolder => ({
  ...folder,
  id: withScopeKey(scope, folder.id),
  scope: getWorkspaceScopeStorageKey(scope),
});

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `folder_${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 运行文件夹 store 事务
 */
async function runWithFolderStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return runIndexedDbRequest(db, FOLDER_STORE_NAME, mode, runner);
}

/**
 * 获取所有文件夹
 */
export async function listFolders(scope: WorkspaceScope): Promise<TableFolder[]> {
  const folders = await runWithFolderStore<TableFolder[]>('readonly', (store) => store.getAll());
  if (!Array.isArray(folders)) return [];
  return folders
    .map((folder) => decodeScopedFolder(folder, scope))
    .filter((folder): folder is TableFolder => folder != null)
    .sort((a, b) => a.order - b.order);
}

/**
 * 获取指定父文件夹下的子文件夹
 */
export async function listChildFolders(
  scope: WorkspaceScope,
  parentId?: string,
): Promise<TableFolder[]> {
  const allFolders = await listFolders(scope);
  return allFolders.filter((f) => (parentId ? f.parentId === parentId : !f.parentId));
}

/**
 * 获取单个文件夹
 */
export async function getFolder(id: string, scope: WorkspaceScope): Promise<TableFolder | null> {
  const folder = await runWithFolderStore<TableFolder | undefined>('readonly', (store) =>
    store.get(withScopeKey(scope, id)),
  );
  if (folder) {
    return decodeScopedFolder(folder, scope);
  }
  if (scope.kind === 'anonymous') {
    const legacyFolder = await runWithFolderStore<TableFolder | undefined>('readonly', (store) =>
      store.get(id),
    );
    return legacyFolder ? decodeScopedFolder(legacyFolder, scope) : null;
  }
  return null;
}

/**
 * 创建文件夹
 */
export async function createFolder(
  name: string,
  scope: WorkspaceScope,
  parentId?: string,
): Promise<TableFolder> {
  // 获取同级文件夹以确定 order
  const siblings = await listChildFolders(scope, parentId);
  const maxOrder = siblings.reduce((max, f) => Math.max(max, f.order), 0);

  const folder: TableFolder = {
    id: generateId(),
    name: name.trim(),
    parentId,
    order: maxOrder + 1,
    createdAt: Date.now(),
  };

  await runWithFolderStore<IDBValidKey>('readwrite', (store) =>
    store.add(encodeFolder(folder, scope)),
  );
  return folder;
}

/**
 * 更新文件夹
 */
export async function updateFolder(folder: TableFolder, scope: WorkspaceScope): Promise<void> {
  await runWithFolderStore<IDBValidKey>('readwrite', (store) =>
    store.put(encodeFolder(folder, scope)),
  );
  if (scope.kind === 'anonymous') {
    await runWithFolderStore<undefined>('readwrite', (store) => store.delete(folder.id));
  }
}

/**
 * 重命名文件夹
 */
export async function renameFolder(
  id: string,
  newName: string,
  scope: WorkspaceScope,
): Promise<void> {
  const folder = await getFolder(id, scope);
  if (!folder) {
    throw new Error('文件夹不存在');
  }
  folder.name = newName.trim();
  await updateFolder(folder, scope);
}

/**
 * 移动文件夹到新的父文件夹
 */
export async function moveFolder(
  id: string,
  scope: WorkspaceScope,
  newParentId?: string,
): Promise<void> {
  const folder = await getFolder(id, scope);
  if (!folder) {
    throw new Error('文件夹不存在');
  }

  // 防止移动到自身或子文件夹下
  if (newParentId) {
    const descendants = await getDescendantFolderIds(id, scope);
    if (newParentId === id || descendants.includes(newParentId)) {
      throw new Error('不能将文件夹移动到自身或其子文件夹下');
    }
  }

  // 获取目标位置的同级文件夹以确定 order
  const siblings = await listChildFolders(scope, newParentId);
  const maxOrder = siblings.reduce((max, f) => Math.max(max, f.order), 0);

  folder.parentId = newParentId;
  folder.order = maxOrder + 1;
  await updateFolder(folder, scope);
}

/**
 * 获取文件夹的所有后代文件夹 ID
 */
export async function getDescendantFolderIds(
  folderId: string,
  scope: WorkspaceScope,
): Promise<string[]> {
  const allFolders = await listFolders(scope);
  const descendants: string[] = [];

  function collectDescendants(parentId: string) {
    for (const folder of allFolders) {
      if (folder.parentId === parentId) {
        descendants.push(folder.id);
        collectDescendants(folder.id);
      }
    }
  }

  collectDescendants(folderId);
  return descendants;
}

/**
 * 删除文件夹（子表移回未分组，子文件夹及其表也移回未分组）
 */
export async function deleteFolder(id: string, scope: WorkspaceScope): Promise<void> {
  // 获取所有后代文件夹
  const descendantIds = await getDescendantFolderIds(id, scope);
  const allFolderIds = [id, ...descendantIds];

  // 先删除所有涉及的文件夹
  for (const folderId of allFolderIds) {
    await runWithFolderStore<undefined>('readwrite', (store) => store.delete(folderId));
    await runWithFolderStore<undefined>('readwrite', (store) =>
      store.delete(withScopeKey(scope, folderId)),
    );
  }

  // 注意：表的 folderId 清理需要在调用处处理
  // 因为表存储在不同的 store 中
  return;
}

/**
 * 清空所有文件夹
 */
export async function clearFolders(scope: WorkspaceScope): Promise<void> {
  const folders = await listFolders(scope);
  for (const folder of folders) {
    await runWithFolderStore<undefined>('readwrite', (store) => store.delete(folder.id));
    await runWithFolderStore<undefined>('readwrite', (store) =>
      store.delete(withScopeKey(scope, folder.id)),
    );
  }
}

/**
 * 批量写入文件夹（覆盖式）
 */
export async function bulkPutFolders(folders: TableFolder[], scope: WorkspaceScope): Promise<void> {
  if (folders.length === 0) return;
  await runWithFolderStore<IDBValidKey>('readwrite', (store) => {
    for (let i = 0; i < folders.length - 1; i++) {
      store.put(encodeFolder(folders[i], scope));
    }
    return store.put(encodeFolder(folders[folders.length - 1], scope));
  });
}

/**
 * 获取文件夹路径（从根到当前）
 */
export async function getFolderPath(
  folderId: string,
  scope: WorkspaceScope,
): Promise<TableFolder[]> {
  const allFolders = await listFolders(scope);
  const folderMap = new Map(allFolders.map((f) => [f.id, f]));

  const path: TableFolder[] = [];
  let currentId: string | undefined = folderId;

  while (currentId) {
    const folder = folderMap.get(currentId);
    if (!folder) break;
    path.unshift(folder);
    currentId = folder.parentId;
  }

  return path;
}

/**
 * 构建文件夹树结构
 */
export type FolderTreeNode = TableFolder & {
  children: FolderTreeNode[];
  tableCount?: number;
};

export async function buildFolderTree(scope: WorkspaceScope): Promise<FolderTreeNode[]> {
  const allFolders = await listFolders(scope);
  const folderMap = new Map<string, FolderTreeNode>();

  // 初始化所有节点
  for (const folder of allFolders) {
    folderMap.set(folder.id, { ...folder, children: [] });
  }

  // 构建树结构
  const rootNodes: FolderTreeNode[] = [];

  for (const folder of allFolders) {
    const node = folderMap.get(folder.id);
    if (!node) continue;
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)?.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  // 对每层的 children 按 order 排序
  function sortChildren(nodes: FolderTreeNode[]) {
    nodes.sort((a, b) => a.order - b.order);
    for (const node of nodes) {
      sortChildren(node.children);
    }
  }

  sortChildren(rootNodes);
  return rootNodes;
}
