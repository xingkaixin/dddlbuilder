import {
  decodeIndexDefinitions,
  decodeMysqlPartitionConfig,
  type WorkspaceSavedTableMetadataUpdate,
} from '@ddlbuilder/workspace-core';
import { savedTableReference, type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { buildScopedWorkspaceKey, getWorkspaceScopeStorageKey } from './workspaceScope';
import { normalizePersistedRows } from '@ddlbuilder/shared-types';
import { runIndexedDbRequest, runIndexedDbTransaction } from './indexedDbTransaction';
import { decodeWorkspaceScopedKey } from './workspaceScopedRecord';
import { openDb, STORE_NAME } from './workspaceDb';
import type { SavedTableMetadata, SavedTableRecord } from './workspaceStorageTypes';
import { resolveSavedTableId } from './savedTableIdentity';
import { applySavedTableStateUpdate, type SavedTableStateUpdate } from './savedTableStateUpdate';
import {
  runWorkspaceEntityWrites,
  type WorkspaceEntityTarget,
  type WorkspaceEntityWrite,
} from './workspaceEntityDeletion';

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

const encodeScopedTableRecord = (
  record: SavedTableRecord,
  scope: WorkspaceScope,
): SavedTableRecord => ({
  ...record,
  normalizedName: withScopeKey(scope, record.normalizedName),
  scope: getWorkspaceScopeStorageKey(scope),
});

const tableTarget = (record: SavedTableRecord, scope: WorkspaceScope): WorkspaceEntityTarget => ({
  scope,
  tableId: resolveSavedTableId(record),
  normalizedName: record.normalizedName,
});

const tableWrite = (
  record: SavedTableRecord,
  scope: WorkspaceScope,
  mode: WorkspaceEntityWrite['mode'],
): WorkspaceEntityWrite => ({
  target: tableTarget(record, scope),
  mode,
});

const rejectFailedWrite = (request: IDBRequest, fail: (error: unknown) => void) => {
  request.onerror = () => fail(request.error ?? new Error('IndexedDB 写入失败'));
};

const decodeScopedTableRecord = (
  record: SavedTableRecord,
  scope: WorkspaceScope,
): SavedTableRecord | null => {
  const decoded = decodeWorkspaceScopedKey(record.normalizedName, record.scope, scope);
  if (!decoded) return null;
  return {
    ...record,
    tableId: resolveSavedTableId(record),
    normalizedName: decoded.key,
    scope: decoded.scope,
    state: {
      ...normalizePersistedRows(record.state),
      indexes: decodeIndexDefinitions(record.state.indexes),
      ...(record.state.mysqlPartitionConfig
        ? { mysqlPartitionConfig: decodeMysqlPartitionConfig(record.state.mysqlPartitionConfig) }
        : {}),
    },
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
    tableId: resolveSavedTableId(record),
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
    tableId: resolveSavedTableId(record),
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
  target: SavedTableTarget,
  scope: WorkspaceScope,
): Promise<SavedTableRecord | null> => {
  const { normalizedName, tableId } = savedTableReference(target);
  if (tableId) {
    const records = await runWithStore<SavedTableRecord[]>('readonly', (store) => store.getAll());
    return (
      records
        .map((item) => decodeScopedTableRecord(item, scope))
        .find((item) => item?.tableId === tableId) ?? null
    );
  }
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
  entityMode: WorkspaceEntityWrite['mode'] = 'activate',
): Promise<void> => {
  await runWorkspaceEntityWrites(
    [tableWrite(record, scope, entityMode)],
    STORE_NAME,
    (tx, fail) => {
      rejectFailedWrite(
        tx.objectStore(STORE_NAME).add(encodeScopedTableRecord(record, scope)),
        fail,
      );
    },
  );
};

export const updateSavedTable = async (
  record: SavedTableRecord,
  scope: WorkspaceScope,
  entityMode: WorkspaceEntityWrite['mode'] = 'update',
): Promise<void> => {
  await runWorkspaceEntityWrites(
    [tableWrite(record, scope, entityMode)],
    STORE_NAME,
    (tx, fail) => {
      rejectFailedWrite(
        tx.objectStore(STORE_NAME).put(encodeScopedTableRecord(record, scope)),
        fail,
      );
    },
  );
};

export const updateSavedTables = async (
  records: SavedTableRecord[],
  scope: WorkspaceScope,
  activatedTableIds: ReadonlySet<string> = new Set(),
): Promise<void> => {
  if (records.length === 0) return;
  await runWorkspaceEntityWrites(
    records.map((record) =>
      tableWrite(
        record,
        scope,
        activatedTableIds.has(resolveSavedTableId(record)) ? 'activate' : 'update',
      ),
    ),
    STORE_NAME,
    (tx, fail) => {
      const store = tx.objectStore(STORE_NAME);
      for (const record of records) {
        rejectFailedWrite(store.put(encodeScopedTableRecord(record, scope)), fail);
      }
    },
  );
};

export const replaceSavedTable = async (
  previousNormalizedName: string,
  record: SavedTableRecord,
  scope: WorkspaceScope,
  entityMode: WorkspaceEntityWrite['mode'] = 'update',
): Promise<void> => {
  await runWorkspaceEntityWrites(
    [tableWrite(record, scope, entityMode)],
    STORE_NAME,
    (tx, fail) => {
      const store = tx.objectStore(STORE_NAME);
      if (record.normalizedName === previousNormalizedName) {
        rejectFailedWrite(store.put(encodeScopedTableRecord(record, scope)), fail);
        return;
      }
      rejectFailedWrite(store.add(encodeScopedTableRecord(record, scope)), fail);
      rejectFailedWrite(store.delete(withScopeKey(scope, previousNormalizedName)), fail);
    },
  );
};

export const updateSavedTableState = async (
  target: SavedTableTarget,
  update: SavedTableStateUpdate,
  scope: WorkspaceScope,
): Promise<SavedTableRecord | null> => {
  const db = await openDb();
  return runIndexedDbTransaction(db, STORE_NAME, 'readwrite', (tx, fail) => {
    const store = tx.objectStore(STORE_NAME);
    const request: IDBRequest<SavedTableRecord[]> = store.getAll();
    let updated: SavedTableRecord | null = null;
    request.onerror = () => fail(request.error);
    request.onsuccess = () => {
      try {
        const records = request.result
          .map((record) => decodeScopedTableRecord(record, scope))
          .filter((record): record is SavedTableRecord => record !== null);
        updated = applySavedTableStateUpdate(target, update, (reference) => {
          const { tableId, normalizedName } = savedTableReference(reference);
          return (
            records.find((record) =>
              tableId ? record.tableId === tableId : record.normalizedName === normalizedName,
            ) ?? null
          );
        });
        if (updated) {
          store.put({
            ...updated,
            normalizedName: withScopeKey(scope, updated.normalizedName),
            scope: getWorkspaceScopeStorageKey(scope),
          } satisfies SavedTableRecord);
        }
      } catch (error) {
        fail(error);
      }
    };
    return () => updated;
  });
};

export const updateSavedTableMetadata = async (
  target: SavedTableTarget,
  update: WorkspaceSavedTableMetadataUpdate,
  scope: WorkspaceScope,
): Promise<SavedTableRecord | null> => {
  const current = await getSavedTable(target, scope);
  if (!current) return null;
  const tableId = resolveSavedTableId(current);
  let updated: SavedTableRecord | null = null;
  await runWorkspaceEntityWrites([tableWrite(current, scope, 'update')], STORE_NAME, (tx, fail) => {
    const store = tx.objectStore(STORE_NAME);
    const request: IDBRequest<SavedTableRecord[]> = store.getAll();
    request.onerror = () => fail(request.error);
    request.onsuccess = () => {
      try {
        const record = request.result
          .map((item) => decodeScopedTableRecord(item, scope))
          .find((item) => item?.tableId === tableId);
        if (!record) return;
        updated = { ...record, ...update };
        rejectFailedWrite(store.put(encodeScopedTableRecord(updated, scope)), fail);
      } catch (error) {
        fail(error);
      }
    };
  });
  return updated;
};

export const deleteSavedTable = async (
  target: SavedTableTarget,
  scope: WorkspaceScope,
): Promise<void> => {
  const record = await getSavedTable(target, scope);
  if (!record) return;
  const normalizedName = record.normalizedName;
  await runWithStore<undefined>('readwrite', (store) =>
    store.delete(withScopeKey(scope, normalizedName)),
  );
};
