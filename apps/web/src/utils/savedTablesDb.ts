import type {
  DatabaseType,
  IndexDefinition,
  PersistedState,
  FieldRow,
  CitusShardingConfig,
  MysqlPartitionConfig,
  TableMiscConfig,
} from '@ddlbuilder/shared-types';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import {
  buildScopedWorkspaceKey,
  getAnonymousWorkspaceScope,
  getCurrentWorkspaceScope,
  getWorkspaceScopeStorageKey,
} from './workspaceScope';

export const DEFAULT_SAVED_TABLE_NAME = '未命名表';

export type SavedTableRecord = {
  normalizedName: string;
  name: string;
  state: PersistedState;
  scope?: string;
  folderId?: string; // 关联的文件夹ID，null/undefined 表示未分组
  trashedAt?: number;
  createdAt: number;
  updatedAt: number;
};

// 仅包含元数据的轻量级类型（用于列表展示）
export type SavedTableMetadata = {
  normalizedName: string;
  name: string;
  dbType: string;
  fieldCount: number;
  scope?: string;
  folderId?: string;
  trashedAt?: number;
  createdAt: number;
  updatedAt: number;
};

// 文件夹类型（支持多级嵌套）
export type TableFolder = {
  id: string;
  scope?: string;
  name: string;
  parentId?: string; // 父文件夹ID，null/undefined 表示根级
  order: number; // 同级排序权重
  createdAt: number;
};

// 字段模板类型
export type TemplateField = {
  fieldName: string;
  fieldType: string;
  fieldComment?: string;
  nullable: '是' | '否';
  defaultKind?: string;
  defaultValue?: string;
  onUpdate?: string;
};

export type FieldTemplate = {
  id: string;
  name: string;
  description?: string;
  keywords?: string[];
  fields: TemplateField[];
  createdAt: number;
  updatedAt: number;
};

export type TableBlueprint = {
  dbType: DatabaseType;
  rows: FieldRow[];
  indexes: IndexDefinition[];
  citusShardingConfig?: CitusShardingConfig;
  mysqlPartitionConfig?: MysqlPartitionConfig;
  tableMiscConfig?: TableMiscConfig;
};

export type TableTemplate = {
  id: string;
  name: string;
  description?: string;
  blueprint: TableBlueprint;
  createdAt: number;
  updatedAt: number;
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
export const DB_VERSION = 12;
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

const ensureIndexedDb = () => {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB 不可用');
  }
};

const LEGACY_SCOPE = getWorkspaceScopeStorageKey(getAnonymousWorkspaceScope());

const withScopeKey = (scope: WorkspaceScope, normalizedName: string) =>
  buildScopedWorkspaceKey(scope, normalizedName);

const decodeScopedTableRecord = (
  record: SavedTableRecord,
  scope: WorkspaceScope,
): SavedTableRecord | null => {
  const scopeKey = getWorkspaceScopeStorageKey(scope);
  if (record.scope && record.scope !== scopeKey) {
    return null;
  }

  if (record.normalizedName.includes('::')) {
    const prefix = `${scopeKey}::`;
    if (!record.normalizedName.startsWith(prefix)) {
      return null;
    }
    return {
      ...record,
      normalizedName: record.normalizedName.slice(prefix.length),
      scope: scopeKey,
    };
  }

  if (scope.kind !== 'anonymous') {
    return null;
  }

  return {
    ...record,
    scope: LEGACY_SCOPE,
  };
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
          versionStore.createIndex('tableNormalizedName', 'tableNormalizedName', { unique: false });
          versionStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Version 3+: review_history store
        if (!db.objectStoreNames.contains(REVIEW_STORE_NAME)) {
          const reviewStore = db.createObjectStore(REVIEW_STORE_NAME, {
            keyPath: 'id',
          });
          reviewStore.createIndex('tableNormalizedName', 'tableNormalizedName', { unique: false });
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

        // Version 6: field_templates store
        if (!db.objectStoreNames.contains(TEMPLATE_STORE_NAME)) {
          const templateStore = db.createObjectStore(TEMPLATE_STORE_NAME, {
            keyPath: 'id',
          });
          templateStore.createIndex('name', 'name', { unique: false });
          templateStore.createIndex('updatedAt', 'updatedAt', {
            unique: false,
          });
        }

        // Version 10: table_templates store
        if (!db.objectStoreNames.contains(TABLE_TEMPLATE_STORE_NAME)) {
          const tableTemplateStore = db.createObjectStore(TABLE_TEMPLATE_STORE_NAME, {
            keyPath: 'id',
          });
          tableTemplateStore.createIndex('name', 'name', { unique: false });
          tableTemplateStore.createIndex('updatedAt', 'updatedAt', {
            unique: false,
          });
        }

        // Version 7: workspace stores
        if (!db.objectStoreNames.contains(WORKSPACE_GLOBAL_DRAFT_STORE_NAME)) {
          db.createObjectStore(WORKSPACE_GLOBAL_DRAFT_STORE_NAME, {
            keyPath: 'id',
          });
        }
        if (!db.objectStoreNames.contains(WORKSPACE_SAVED_DRAFTS_STORE_NAME)) {
          db.createObjectStore(WORKSPACE_SAVED_DRAFTS_STORE_NAME, {
            keyPath: 'normalizedName',
          });
        }
        if (!db.objectStoreNames.contains(WORKSPACE_SESSION_STORE_NAME)) {
          db.createObjectStore(WORKSPACE_SESSION_STORE_NAME, {
            keyPath: 'id',
          });
        }
        if (!db.objectStoreNames.contains(WORKSPACE_SYNC_META_STORE_NAME)) {
          db.createObjectStore(WORKSPACE_SYNC_META_STORE_NAME, {
            keyPath: 'id',
          });
        }
        if (!db.objectStoreNames.contains(WORKSPACE_SYNC_OUTBOX_STORE_NAME)) {
          db.createObjectStore(WORKSPACE_SYNC_OUTBOX_STORE_NAME, {
            keyPath: 'id',
          });
        }
        if (!db.objectStoreNames.contains(WORKSPACE_ENTITY_META_STORE_NAME)) {
          db.createObjectStore(WORKSPACE_ENTITY_META_STORE_NAME, {
            keyPath: 'id',
          });
        }
        if (!db.objectStoreNames.contains(WORKSPACE_SYNC_CONFLICT_STORE_NAME)) {
          db.createObjectStore(WORKSPACE_SYNC_CONFLICT_STORE_NAME, {
            keyPath: 'id',
          });
        }

        if (request.transaction && request.oldVersion < 8) {
          if (db.objectStoreNames.contains(STORE_NAME)) {
            const store = request.transaction.objectStore(STORE_NAME);
            const cursorRequest = store.openCursor();
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (!cursor) return;
              const value = cursor.value as SavedTableRecord;
              if (!value.scope && !value.normalizedName.includes('::')) {
                store.delete(cursor.primaryKey);
                store.put({
                  ...value,
                  normalizedName: withScopeKey(getAnonymousWorkspaceScope(), value.normalizedName),
                  scope: LEGACY_SCOPE,
                } satisfies SavedTableRecord);
              }
              cursor.continue();
            };
          }
        }

        // Version 9: Migrate global draft keys from "::global" to "::default"
        if (request.transaction && request.oldVersion < 9) {
          if (db.objectStoreNames.contains(WORKSPACE_GLOBAL_DRAFT_STORE_NAME)) {
            const draftStore = request.transaction.objectStore(WORKSPACE_GLOBAL_DRAFT_STORE_NAME);
            const cursorRequest = draftStore.openCursor();
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (!cursor) return;
              const value = cursor.value as {
                id: string;
                scope?: string;
                state: unknown;
                updatedAt: number;
              };
              if (typeof value.id === 'string' && value.id.endsWith('::global')) {
                const newId = value.id.slice(0, -'::global'.length) + '::default';
                draftStore.put({
                  ...value,
                  id: newId,
                });
                draftStore.delete(value.id);
              }
              cursor.continue();
            };
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
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('事务被中止'));
    tx.oncomplete = () => {
      db.close();
    };
  });
};

export const normalizeSavedTableName = (name: string): string => name.trim().toLowerCase();

export const ensureSavedTableName = (name: string): string => {
  const trimmed = name.trim();
  return trimmed || DEFAULT_SAVED_TABLE_NAME;
};

export const listSavedTables = async (
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<SavedTableRecord[]> => {
  const records = await runWithStore<SavedTableRecord[]>('readonly', (store) => store.getAll());
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => decodeScopedTableRecord(record, scope))
    .filter((record): record is SavedTableRecord => record != null && !record.trashedAt);
};

export const listTrashedSavedTables = async (
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<SavedTableRecord[]> => {
  const records = await runWithStore<SavedTableRecord[]>('readonly', (store) => store.getAll());
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => decodeScopedTableRecord(record, scope))
    .filter((record): record is SavedTableRecord => record != null && Boolean(record.trashedAt));
};

// 仅获取元数据（性能优化）
export const listSavedTableMetadata = async (
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<SavedTableMetadata[]> => {
  const records = await listSavedTables(scope);

  return records.map((record) => ({
    normalizedName: record.normalizedName,
    name: record.name,
    dbType: record.state.dbType,
    fieldCount: record.state.rows?.filter((row) => row.fieldName?.trim()).length || 0,
    folderId: record.folderId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }));
};

export const listTrashedSavedTableMetadata = async (
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<SavedTableMetadata[]> => {
  const records = await listTrashedSavedTables(scope);

  return records.map((record) => ({
    normalizedName: record.normalizedName,
    name: record.name,
    dbType: record.state.dbType,
    fieldCount: record.state.rows?.filter((row) => row.fieldName?.trim()).length || 0,
    folderId: record.folderId,
    trashedAt: record.trashedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }));
};

export const getSavedTable = async (
  normalizedName: string,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<SavedTableRecord | null> => {
  const record = await runWithStore<SavedTableRecord | undefined>('readonly', (store) =>
    store.get(withScopeKey(scope, normalizedName)),
  );
  if (record) {
    return decodeScopedTableRecord(record, scope);
  }
  return null;
};

export const addSavedTable = async (
  record: SavedTableRecord,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<void> => {
  await runWithStore<IDBValidKey>('readwrite', (store) =>
    store.add({
      ...record,
      normalizedName: withScopeKey(scope, record.normalizedName),
      scope: getWorkspaceScopeStorageKey(scope),
    } satisfies SavedTableRecord),
  );
};

export const updateSavedTable = async (
  record: SavedTableRecord,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<void> => {
  await runWithStore<IDBValidKey>('readwrite', (store) =>
    store.put({
      ...record,
      normalizedName: withScopeKey(scope, record.normalizedName),
      scope: getWorkspaceScopeStorageKey(scope),
    } satisfies SavedTableRecord),
  );
};

export const deleteSavedTable = async (
  normalizedName: string,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<void> => {
  await runWithStore<undefined>('readwrite', (store) =>
    store.delete(withScopeKey(scope, normalizedName)),
  );
};

export const moveSavedTableToTrash = async (
  normalizedName: string,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<void> => {
  const record = await getSavedTable(normalizedName, scope);
  if (!record) return;
  await updateSavedTable(
    {
      ...record,
      folderId: undefined,
      trashedAt: Date.now(),
      updatedAt: Date.now(),
    },
    scope,
  );
};

export const restoreSavedTableFromTrash = async (
  normalizedName: string,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<void> => {
  const records = await listTrashedSavedTables(scope);
  const record = records.find((item) => item.normalizedName === normalizedName);
  if (!record) return;
  await updateSavedTable(
    {
      ...record,
      trashedAt: undefined,
      updatedAt: Date.now(),
    },
    scope,
  );
};
