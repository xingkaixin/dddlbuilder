import type { SavedTableRecord } from './workspaceStorageTypes';
import {
  buildScopedWorkspaceKey,
  getAnonymousWorkspaceScope,
  getWorkspaceScopeStorageKey,
} from './workspaceScope';

export const DB_NAME = 'ddlbuilder';
export const DB_VERSION = 15;
export const STORE_NAME = 'saved_tables';
export const VERSION_STORE_NAME = 'table_versions';
export const REVIEW_STORE_NAME = 'review_history';
export const FOLDER_STORE_NAME = 'table_folders';
export const TEMPLATE_STORE_NAME = 'field_templates';
export const TABLE_TEMPLATE_STORE_NAME = 'table_templates';
export const WORKSPACE_GLOBAL_DRAFT_STORE_NAME = 'workspace_global_draft';
export const WORKSPACE_SAVED_DRAFTS_STORE_NAME = 'workspace_saved_drafts';
export const WORKSPACE_SESSION_STORE_NAME = 'workspace_session';
export const WORKSPACE_SYNC_META_STORE_NAME = 'workspace_sync_meta';
export const WORKSPACE_SYNC_OUTBOX_STORE_NAME = 'workspace_sync_outbox';
export const WORKSPACE_ENTITY_META_STORE_NAME = 'workspace_entity_meta';
export const WORKSPACE_SYNC_CONFLICT_STORE_NAME = 'workspace_sync_conflicts';

const LEGACY_SCOPE = getWorkspaceScopeStorageKey(getAnonymousWorkspaceScope());

const ensureIndexedDb = () => {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB 不可用');
};

export const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    try {
      ensureIndexedDb();
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      let blocked = false;
      request.onblocked = () => {
        blocked = true;
        reject(new Error('数据库升级被其他页面阻塞，请关闭其他页面后重试'));
      };
      request.onerror = () => reject(request.error ?? new Error('打开 IndexedDB 失败'));
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = event.oldVersion;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'normalizedName' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
          store.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains(VERSION_STORE_NAME)) {
          const store = db.createObjectStore(VERSION_STORE_NAME, { keyPath: 'id' });
          store.createIndex('tableKey', 'tableKey', { unique: false });
          store.createIndex('tableNormalizedName', 'tableNormalizedName', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(REVIEW_STORE_NAME)) {
          const store = db.createObjectStore(REVIEW_STORE_NAME, { keyPath: 'id' });
          store.createIndex('tableKey', 'tableKey', { unique: false });
          store.createIndex('tableNormalizedName', 'tableNormalizedName', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(FOLDER_STORE_NAME)) {
          const store = db.createObjectStore(FOLDER_STORE_NAME, { keyPath: 'id' });
          store.createIndex('parentId', 'parentId', { unique: false });
          store.createIndex('order', 'order', { unique: false });
        }

        const transaction = request.transaction;
        if (transaction && oldVersion < 15) {
          for (const storeName of [VERSION_STORE_NAME, REVIEW_STORE_NAME]) {
            const cursorRequest = transaction.objectStore(storeName).openCursor();
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (!cursor) return;
              const record = cursor.value;
              if (!record.tableKey) {
                const tableId = `legacy:${record.tableNormalizedName}`;
                cursor.update({ ...record, tableId, tableKey: `${LEGACY_SCOPE}::${tableId}` });
              }
              cursor.continue();
            };
          }
        }
        if (transaction && db.objectStoreNames.contains(VERSION_STORE_NAME)) {
          const store = transaction.objectStore(VERSION_STORE_NAME);
          if (!store.indexNames.contains('tableKey')) {
            store.createIndex('tableKey', 'tableKey', { unique: false });
          }
        }
        if (transaction && db.objectStoreNames.contains(REVIEW_STORE_NAME)) {
          const store = transaction.objectStore(REVIEW_STORE_NAME);
          if (!store.indexNames.contains('tableKey')) {
            store.createIndex('tableKey', 'tableKey', { unique: false });
          }
        }
        if (transaction && db.objectStoreNames.contains(STORE_NAME)) {
          const store = transaction.objectStore(STORE_NAME);
          if (!store.indexNames.contains('folderId')) {
            store.createIndex('folderId', 'folderId', { unique: false });
          }
        }

        if (!db.objectStoreNames.contains(TEMPLATE_STORE_NAME)) {
          const store = db.createObjectStore(TEMPLATE_STORE_NAME, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(TABLE_TEMPLATE_STORE_NAME)) {
          const store = db.createObjectStore(TABLE_TEMPLATE_STORE_NAME, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        const workspaceStores = [
          WORKSPACE_GLOBAL_DRAFT_STORE_NAME,
          WORKSPACE_SAVED_DRAFTS_STORE_NAME,
          WORKSPACE_SESSION_STORE_NAME,
          WORKSPACE_SYNC_META_STORE_NAME,
          WORKSPACE_SYNC_OUTBOX_STORE_NAME,
          WORKSPACE_ENTITY_META_STORE_NAME,
          WORKSPACE_SYNC_CONFLICT_STORE_NAME,
        ] as const;
        workspaceStores.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, {
              keyPath: storeName === WORKSPACE_SAVED_DRAFTS_STORE_NAME ? 'normalizedName' : 'id',
            });
          }
        });

        if (transaction && oldVersion < 8 && db.objectStoreNames.contains(STORE_NAME)) {
          const store = transaction.objectStore(STORE_NAME);
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const value = cursor.value as SavedTableRecord;
            if (!value.scope && !value.normalizedName.includes('::')) {
              store.delete(cursor.primaryKey);
              store.put({
                ...value,
                normalizedName: buildScopedWorkspaceKey(
                  getAnonymousWorkspaceScope(),
                  value.normalizedName,
                ),
                scope: LEGACY_SCOPE,
              } satisfies SavedTableRecord);
            }
            cursor.continue();
          };
        }

        if (
          transaction &&
          oldVersion < 9 &&
          db.objectStoreNames.contains(WORKSPACE_GLOBAL_DRAFT_STORE_NAME)
        ) {
          const store = transaction.objectStore(WORKSPACE_GLOBAL_DRAFT_STORE_NAME);
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const value = cursor.value as { id: string };
            if (typeof value.id === 'string' && value.id.endsWith('::global')) {
              store.put({ ...value, id: `${value.id.slice(0, -'::global'.length)}::default` });
              store.delete(value.id);
            }
            cursor.continue();
          };
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        if (blocked) {
          db.close();
          return;
        }
        resolve(db);
      };
    } catch (error) {
      reject(error);
    }
  });
