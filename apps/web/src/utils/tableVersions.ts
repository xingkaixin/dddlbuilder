import type { PersistedState } from '@ddlbuilder/shared-types';
import type { TableVersion, TableVersionMetadata } from './savedTablesDb';
import { openDb, VERSION_STORE_NAME } from './savedTablesDb';
import { normalizePersistedRows } from './helpers';

const decodeVersion = (version: TableVersion): TableVersion => ({
  ...version,
  state: normalizePersistedRows(version.state),
});

/** 每个表最多保留的版本数量 */
export const MAX_VERSIONS_PER_TABLE = 20;
export const INITIAL_VERSION_MESSAGE_KEY = 'initial_version';

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 运行事务
 */
async function runWithStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VERSION_STORE_NAME, mode);
    const store = tx.objectStore(VERSION_STORE_NAME);
    const request = runner(store);

    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error('请求失败'));
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'));
    tx.oncomplete = () => db.close();
  });
}

/**
 * 创建版本快照
 */
export async function createVersion(
  tableNormalizedName: string,
  state: PersistedState,
  message?: string,
): Promise<TableVersion> {
  const version: TableVersion = {
    id: generateId(),
    tableNormalizedName,
    state,
    message,
    createdAt: Date.now(),
  };

  await runWithStore<IDBValidKey>('readwrite', (store) => store.add(version));

  // 清理超限版本
  await pruneOldVersions(tableNormalizedName, MAX_VERSIONS_PER_TABLE);

  return version;
}

/**
 * 获取表的所有版本（按时间倒序）
 */
export async function listVersions(tableNormalizedName: string): Promise<TableVersion[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VERSION_STORE_NAME, 'readonly');
    const store = tx.objectStore(VERSION_STORE_NAME);
    const index = store.index('tableNormalizedName');
    const request = index.getAll(tableNormalizedName);

    request.onsuccess = () => {
      const versions = (request.result as TableVersion[]) || [];
      // 按创建时间倒序
      versions.sort((a, b) => b.createdAt - a.createdAt);
      resolve(versions.map(decodeVersion));
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * 获取表的版本元数据列表（轻量级）
 */
export async function listVersionMetadata(
  tableNormalizedName: string,
): Promise<TableVersionMetadata[]> {
  const versions = await listVersions(tableNormalizedName);
  return versions.map((v) => ({
    id: v.id,
    tableNormalizedName: v.tableNormalizedName,
    message: v.message,
    dbType: v.state.dbType,
    fieldCount: v.state.rows?.filter((r) => r.fieldName?.trim()).length || 0,
    createdAt: v.createdAt,
  }));
}

/**
 * 获取单个版本
 */
export async function getVersion(id: string): Promise<TableVersion | null> {
  const result = await runWithStore<TableVersion | undefined>('readonly', (store) => store.get(id));
  return result ? decodeVersion(result) : null;
}

/**
 * 删除版本
 */
export async function deleteVersion(id: string): Promise<void> {
  await runWithStore<undefined>('readwrite', (store) => store.delete(id));
}

/**
 * 删除表的所有版本
 */
export async function deleteAllVersions(tableNormalizedName: string): Promise<void> {
  const versions = await listVersions(tableNormalizedName);
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VERSION_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VERSION_STORE_NAME);

    for (const v of versions) {
      store.delete(v.id);
    }

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 清理超出限制的旧版本
 */
export async function pruneOldVersions(
  tableNormalizedName: string,
  maxCount: number,
): Promise<number> {
  const versions = await listVersions(tableNormalizedName);

  if (versions.length <= maxCount) {
    return 0;
  }

  // 版本已按时间倒序，保留前 maxCount 个
  const toDelete = versions.slice(maxCount);

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VERSION_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VERSION_STORE_NAME);

    for (const v of toDelete) {
      store.delete(v.id);
    }

    tx.oncomplete = () => {
      db.close();
      resolve(toDelete.length);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 获取表的版本数量
 */
export async function countVersions(tableNormalizedName: string): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VERSION_STORE_NAME, 'readonly');
    const store = tx.objectStore(VERSION_STORE_NAME);
    const index = store.index('tableNormalizedName');
    const request = index.count(tableNormalizedName);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
