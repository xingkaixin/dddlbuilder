import { FOLDER_STORE_NAME, openDb, STORE_NAME } from './workspaceDb';
import type { SavedTableRecord, TableFolder } from './workspaceStorageTypes';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { buildScopedWorkspaceKey, getWorkspaceScopeStorageKey } from './workspaceScope';
import { runIndexedDbRequest } from './indexedDbTransaction';
import { decodeWorkspaceScopedKey } from './workspaceScopedRecord';
import {
  buildFolderTreeModel,
  buildFolderDeletionPlan,
  createFolderRecord,
  moveFolderRecord,
  renameFolderRecord,
  type FolderTreeNode,
} from './folderModel';

export type { FolderTreeNode } from './folderModel';

const withScopeKey = (scope: WorkspaceScope, id: string) => buildScopedWorkspaceKey(scope, id);

const decodeScopedFolder = (folder: TableFolder, scope: WorkspaceScope): TableFolder | null => {
  const decoded = decodeWorkspaceScopedKey(folder.id, folder.scope, scope);
  return decoded
    ? {
        ...folder,
        id: decoded.key,
        scope: decoded.scope,
        updatedAt: folder.updatedAt ?? folder.createdAt,
      }
    : null;
};

const encodeFolder = (folder: TableFolder, scope: WorkspaceScope): TableFolder => ({
  ...folder,
  id: withScopeKey(scope, folder.id),
  scope: getWorkspaceScopeStorageKey(scope),
});

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
  const folder = createFolderRecord(await listFolders(scope), name, parentId);

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
  await updateFolder(renameFolderRecord(folder, newName), scope);
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

  await updateFolder(moveFolderRecord(await listFolders(scope), id, newParentId), scope);
}

/**
 * 获取文件夹的所有后代文件夹 ID
 */

/**
 * 删除文件夹及后代，并把其中仍生效的表移入回收站
 */
export async function deleteFolder(id: string, scope: WorkspaceScope): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FOLDER_STORE_NAME, STORE_NAME], 'readwrite');
    const folderStore = transaction.objectStore(FOLDER_STORE_NAME);
    const tableStore = transaction.objectStore(STORE_NAME);
    const folderRequest = folderStore.getAll();
    const tableRequest = tableStore.getAll();
    let affectedFolderIds: string[] = [];
    let foldersLoaded = false;
    let tablesLoaded = false;
    let settled = false;

    const fail = (error: unknown, message: string) => {
      if (settled) return;
      settled = true;
      db.close();
      reject(error ?? new Error(message));
    };

    const applyDeletion = () => {
      if (!foldersLoaded || !tablesLoaded) return;
      const folders = folderRequest.result
        .map((folder) => decodeScopedFolder(folder, scope))
        .filter((folder): folder is TableFolder => folder != null);
      const tables = (tableRequest.result as SavedTableRecord[]).filter((record) =>
        decodeWorkspaceScopedKey(record.normalizedName, record.scope, scope),
      );
      const plan = buildFolderDeletionPlan(folders, tables, id);
      affectedFolderIds = plan.folderIds;
      for (const record of plan.tablesToTrash) tableStore.put(record);

      for (const folderId of affectedFolderIds) {
        folderStore.delete(withScopeKey(scope, folderId));
        if (scope.kind === 'anonymous') folderStore.delete(folderId);
      }
    };

    folderRequest.onsuccess = () => {
      foldersLoaded = true;
      applyDeletion();
    };
    tableRequest.onsuccess = () => {
      tablesLoaded = true;
      applyDeletion();
    };
    transaction.onerror = () => fail(transaction.error, '事务失败');
    transaction.onabort = () => fail(transaction.error, '事务被中止');
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      db.close();
      resolve(affectedFolderIds);
    };
  });
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

/**
 * 构建文件夹树结构
 */
export async function buildFolderTree(scope: WorkspaceScope): Promise<FolderTreeNode[]> {
  return buildFolderTreeModel(await listFolders(scope));
}
