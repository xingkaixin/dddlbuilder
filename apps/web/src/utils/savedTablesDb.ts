import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { buildScopedWorkspaceKey, getWorkspaceScopeStorageKey } from './workspaceScope';
import { normalizePersistedRows } from './helpers';
import { runIndexedDbRequest } from './indexedDbTransaction';
import { decodeWorkspaceScopedKey } from './workspaceScopedRecord';
import { openDb, STORE_NAME } from './workspaceDb';
import type { SavedTableMetadata, SavedTableRecord } from './workspaceStorageTypes';

export { openDb } from './workspaceDb';
export {
  DB_NAME,
  DB_VERSION,
  FOLDER_STORE_NAME,
  REVIEW_STORE_NAME,
  STORE_NAME,
  TABLE_TEMPLATE_STORE_NAME,
  TEMPLATE_STORE_NAME,
  VERSION_STORE_NAME,
  WORKSPACE_ENTITY_META_STORE_NAME,
  WORKSPACE_GLOBAL_DRAFT_STORE_NAME,
  WORKSPACE_SAVED_DRAFTS_STORE_NAME,
  WORKSPACE_SESSION_STORE_NAME,
  WORKSPACE_SYNC_CONFLICT_STORE_NAME,
  WORKSPACE_SYNC_META_STORE_NAME,
  WORKSPACE_SYNC_OUTBOX_STORE_NAME,
} from './workspaceDb';
export type {
  FieldTemplate,
  SavedTableMetadata,
  SavedTableRecord,
  TableBlueprint,
  TableFolder,
  TableTemplate,
  TableVersion,
  TableVersionMetadata,
  TemplateField,
} from './workspaceStorageTypes';

export const DEFAULT_SAVED_TABLE_NAME = '未命名表';

const withScopeKey = (scope: WorkspaceScope, normalizedName: string) =>
  buildScopedWorkspaceKey(scope, normalizedName);

const decodeScopedTableRecord = (
  record: SavedTableRecord,
  scope: WorkspaceScope,
): SavedTableRecord | null => {
  const decoded = decodeWorkspaceScopedKey(record.normalizedName, record.scope, scope);
  if (!decoded) return null;
  return {
    ...record,
    normalizedName: decoded.key,
    scope: decoded.scope,
    state: normalizePersistedRows(record.state),
  };
};

const runWithStore = async <T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb();
  return runIndexedDbRequest(db, STORE_NAME, mode, runner);
};

export const normalizeSavedTableName = (name: string): string => name.trim().toLowerCase();

export const ensureSavedTableName = (name: string): string => {
  const trimmed = name.trim();
  return trimmed || DEFAULT_SAVED_TABLE_NAME;
};

export const listSavedTables = async (scope: WorkspaceScope): Promise<SavedTableRecord[]> => {
  const records = await runWithStore<SavedTableRecord[]>('readonly', (store) => store.getAll());
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => decodeScopedTableRecord(record, scope))
    .filter((record): record is SavedTableRecord => record != null && !record.trashedAt);
};

export const listTrashedSavedTables = async (
  scope: WorkspaceScope,
): Promise<SavedTableRecord[]> => {
  const records = await runWithStore<SavedTableRecord[]>('readonly', (store) => store.getAll());
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => decodeScopedTableRecord(record, scope))
    .filter((record): record is SavedTableRecord => record != null && Boolean(record.trashedAt));
};

// 仅获取元数据（性能优化）
export const listSavedTableMetadata = async (
  scope: WorkspaceScope,
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
  scope: WorkspaceScope,
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
  scope: WorkspaceScope,
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
  scope: WorkspaceScope,
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
  scope: WorkspaceScope,
): Promise<void> => {
  await runWithStore<IDBValidKey>('readwrite', (store) =>
    store.put({
      ...record,
      normalizedName: withScopeKey(scope, record.normalizedName),
      scope: getWorkspaceScopeStorageKey(scope),
    } satisfies SavedTableRecord),
  );
};

export const updateSavedTables = async (
  records: SavedTableRecord[],
  scope: WorkspaceScope,
): Promise<void> => {
  if (records.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const record of records) {
      store.put({
        ...record,
        normalizedName: withScopeKey(scope, record.normalizedName),
        scope: getWorkspaceScopeStorageKey(scope),
      } satisfies SavedTableRecord);
    }
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('事务被中止'));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
};

export const deleteSavedTable = async (
  normalizedName: string,
  scope: WorkspaceScope,
): Promise<void> => {
  await runWithStore<undefined>('readwrite', (store) =>
    store.delete(withScopeKey(scope, normalizedName)),
  );
};

export const moveSavedTableToTrash = async (
  normalizedName: string,
  scope: WorkspaceScope,
): Promise<void> => {
  const record = await getSavedTable(normalizedName, scope);
  if (!record) return;
  await updateSavedTable(
    {
      ...record,
      trashedAt: Date.now(),
      updatedAt: Date.now(),
    },
    scope,
  );
};

export const restoreSavedTableFromTrash = async (
  normalizedName: string,
  scope: WorkspaceScope,
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
