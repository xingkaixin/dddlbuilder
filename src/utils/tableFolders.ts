import { openDb, FOLDER_STORE_NAME, type TableFolder } from './savedTablesDb';

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
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: (value: T) => void) => (value: T) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const tx = db.transaction(FOLDER_STORE_NAME, mode);
    const store = tx.objectStore(FOLDER_STORE_NAME);
    const request = runner(store);

    request.onsuccess = () => finish(resolve)(request.result as T);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB 请求失败'));
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('事务被中止'));
    tx.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * 获取所有文件夹
 */
export async function listFolders(): Promise<TableFolder[]> {
  const folders = await runWithFolderStore<TableFolder[]>('readonly', (store) =>
    store.getAll(),
  );
  if (!Array.isArray(folders)) return [];
  // 按 order 排序
  return folders.sort((a, b) => a.order - b.order);
}

/**
 * 获取指定父文件夹下的子文件夹
 */
export async function listChildFolders(
  parentId?: string,
): Promise<TableFolder[]> {
  const allFolders = await listFolders();
  return allFolders.filter((f) =>
    parentId ? f.parentId === parentId : !f.parentId,
  );
}

/**
 * 获取单个文件夹
 */
export async function getFolder(id: string): Promise<TableFolder | null> {
  const folder = await runWithFolderStore<TableFolder | undefined>(
    'readonly',
    (store) => store.get(id),
  );
  return folder ?? null;
}

/**
 * 创建文件夹
 */
export async function createFolder(
  name: string,
  parentId?: string,
): Promise<TableFolder> {
  // 获取同级文件夹以确定 order
  const siblings = await listChildFolders(parentId);
  const maxOrder = siblings.reduce((max, f) => Math.max(max, f.order), 0);

  const folder: TableFolder = {
    id: generateId(),
    name: name.trim(),
    parentId,
    order: maxOrder + 1,
    createdAt: Date.now(),
  };

  await runWithFolderStore<IDBValidKey>('readwrite', (store) =>
    store.add(folder),
  );
  return folder;
}

/**
 * 更新文件夹
 */
export async function updateFolder(folder: TableFolder): Promise<void> {
  await runWithFolderStore<IDBValidKey>('readwrite', (store) =>
    store.put(folder),
  );
}

/**
 * 重命名文件夹
 */
export async function renameFolder(id: string, newName: string): Promise<void> {
  const folder = await getFolder(id);
  if (!folder) {
    throw new Error('文件夹不存在');
  }
  folder.name = newName.trim();
  await updateFolder(folder);
}

/**
 * 移动文件夹到新的父文件夹
 */
export async function moveFolder(
  id: string,
  newParentId?: string,
): Promise<void> {
  const folder = await getFolder(id);
  if (!folder) {
    throw new Error('文件夹不存在');
  }

  // 防止移动到自身或子文件夹下
  if (newParentId) {
    const descendants = await getDescendantFolderIds(id);
    if (newParentId === id || descendants.includes(newParentId)) {
      throw new Error('不能将文件夹移动到自身或其子文件夹下');
    }
  }

  // 获取目标位置的同级文件夹以确定 order
  const siblings = await listChildFolders(newParentId);
  const maxOrder = siblings.reduce((max, f) => Math.max(max, f.order), 0);

  folder.parentId = newParentId;
  folder.order = maxOrder + 1;
  await updateFolder(folder);
}

/**
 * 获取文件夹的所有后代文件夹 ID
 */
export async function getDescendantFolderIds(
  folderId: string,
): Promise<string[]> {
  const allFolders = await listFolders();
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
export async function deleteFolder(id: string): Promise<void> {
  // 获取所有后代文件夹
  const descendantIds = await getDescendantFolderIds(id);
  const allFolderIds = [id, ...descendantIds];

  // 先删除所有涉及的文件夹
  for (const folderId of allFolderIds) {
    await runWithFolderStore<undefined>('readwrite', (store) =>
      store.delete(folderId),
    );
  }

  // 注意：表的 folderId 清理需要在调用处处理
  // 因为表存储在不同的 store 中
  return;
}

/**
 * 获取文件夹路径（从根到当前）
 */
export async function getFolderPath(folderId: string): Promise<TableFolder[]> {
  const allFolders = await listFolders();
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

export async function buildFolderTree(): Promise<FolderTreeNode[]> {
  const allFolders = await listFolders();
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
