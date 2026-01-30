import type { PersistedState } from '@/types';

export const DEFAULT_SAVED_TABLE_NAME = '未命名表';

export type SavedTableRecord = {
  normalizedName: string;
  name: string;
  state: PersistedState;
  folderId?: string; // 关联的文件夹ID，null/undefined 表示未分组
  createdAt: number;
  updatedAt: number;
};

// 仅包含元数据的轻量级类型（用于列表展示）
export type SavedTableMetadata = {
  normalizedName: string;
  name: string;
  dbType: string;
  fieldCount: number;
  folderId?: string;
  createdAt: number;
  updatedAt: number;
};

// 文件夹类型（支持多级嵌套）
export type TableFolder = {
  id: string;
  name: string;
  parentId?: string; // 父文件夹ID，null/undefined 表示根级
  order: number; // 同级排序权重
  createdAt: number;
};

// 版本快照类型
export type TableVersion = {
  id: string;
  tableNormalizedName: string;
  state: PersistedState;
  message?: string;
  createdAt: number;
};

// 版本元数据（用于列表展示）
export type TableVersionMetadata = {
  id: string;
  tableNormalizedName: string;
  message?: string;
  dbType: string;
  fieldCount: number;
  createdAt: number;
};

export const DB_NAME = 'ddlbuilder';
export const DB_VERSION = 5;
export const STORE_NAME = 'saved_tables';
export const VERSION_STORE_NAME = 'table_versions';
export const REVIEW_STORE_NAME = 'review_history';
export const FOLDER_STORE_NAME = 'table_folders';

const ensureIndexedDb = () => {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB 不可用');
  }
};

export const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    try {
      ensureIndexedDb();
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => {
        reject(request.error ?? new Error('打开 IndexedDB 失败'));
      };
      request.onupgradeneeded = () => {
        const db = request.result;

        // Version 1: saved_tables store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'normalizedName',
          });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
          store.createIndex('name', 'name', { unique: false });
        }

        // Version 2: table_versions store
        if (!db.objectStoreNames.contains(VERSION_STORE_NAME)) {
          const versionStore = db.createObjectStore(VERSION_STORE_NAME, {
            keyPath: 'id',
          });
          versionStore.createIndex(
            'tableNormalizedName',
            'tableNormalizedName',
            { unique: false },
          );
          versionStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Version 3+: review_history store
        if (!db.objectStoreNames.contains(REVIEW_STORE_NAME)) {
          const reviewStore = db.createObjectStore(REVIEW_STORE_NAME, {
            keyPath: 'id',
          });
          reviewStore.createIndex(
            'tableNormalizedName',
            'tableNormalizedName',
            { unique: false },
          );
          reviewStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Version 5: table_folders store
        if (!db.objectStoreNames.contains(FOLDER_STORE_NAME)) {
          const folderStore = db.createObjectStore(FOLDER_STORE_NAME, {
            keyPath: 'id',
          });
          folderStore.createIndex('parentId', 'parentId', { unique: false });
          folderStore.createIndex('order', 'order', { unique: false });
        }

        // Version 5: Add folderId index to saved_tables
        const tx = request.transaction;
        if (tx && db.objectStoreNames.contains(STORE_NAME)) {
          const tableStore = tx.objectStore(STORE_NAME);
          if (!tableStore.indexNames.contains('folderId')) {
            tableStore.createIndex('folderId', 'folderId', { unique: false });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
    } catch (error) {
      reject(error);
    }
  });

const runWithStore = async <T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: (value: T) => void) => (value: T) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
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
};

export const normalizeSavedTableName = (name: string): string =>
  name.trim().toLowerCase();

export const ensureSavedTableName = (name: string): string => {
  const trimmed = name.trim();
  return trimmed || DEFAULT_SAVED_TABLE_NAME;
};

export const listSavedTables = async (): Promise<SavedTableRecord[]> => {
  const records = await runWithStore<SavedTableRecord[]>('readonly', (store) =>
    store.getAll(),
  );
  return Array.isArray(records) ? records : [];
};

// 仅获取元数据（性能优化）
export const listSavedTableMetadata = async (): Promise<
  SavedTableMetadata[]
> => {
  const records = await runWithStore<SavedTableRecord[]>('readonly', (store) =>
    store.getAll(),
  );
  if (!Array.isArray(records)) return [];

  return records.map((record) => ({
    normalizedName: record.normalizedName,
    name: record.name,
    dbType: record.state.dbType,
    fieldCount:
      record.state.rows?.filter((row) => row.fieldName?.trim()).length || 0,
    folderId: record.folderId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }));
};

export const getSavedTable = async (
  normalizedName: string,
): Promise<SavedTableRecord | null> => {
  const record = await runWithStore<SavedTableRecord | undefined>(
    'readonly',
    (store) => store.get(normalizedName),
  );
  return record ?? null;
};

export const addSavedTable = async (
  record: SavedTableRecord,
): Promise<void> => {
  await runWithStore<IDBValidKey>('readwrite', (store) => store.add(record));
};

export const updateSavedTable = async (
  record: SavedTableRecord,
): Promise<void> => {
  await runWithStore<IDBValidKey>('readwrite', (store) => store.put(record));
};

export const deleteSavedTable = async (
  normalizedName: string,
): Promise<void> => {
  await runWithStore<undefined>('readwrite', (store) =>
    store.delete(normalizedName),
  );
};
