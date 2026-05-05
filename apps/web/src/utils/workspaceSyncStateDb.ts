import type { WorkspaceEntityOperation, WorkspaceEntityType } from '@ddlbuilder/shared-types';
import {
  openDb,
  WORKSPACE_ENTITY_META_STORE_NAME,
  WORKSPACE_SYNC_CONFLICT_STORE_NAME,
  WORKSPACE_SYNC_META_STORE_NAME,
  WORKSPACE_SYNC_OUTBOX_STORE_NAME,
} from './savedTablesDb';

export const WORKSPACE_OUTBOX_ENQUEUED_EVENT = 'ddlbuilder:workspace-outbox-enqueued';

export type LocalWorkspaceSyncMeta = {
  id: string;
  userId: string;
  cursor: number;
  lastPulledAt?: number;
  lastPushedAt?: number;
};

export type LocalWorkspaceEntityMeta = {
  id: string;
  workspaceId: string;
  entityType: WorkspaceEntityType;
  entityId: string;
  version: number;
  contentHash: string | null;
};

export type LocalWorkspaceOutboxItem = {
  id: string;
  workspaceId: string;
  entityType: WorkspaceEntityType;
  entityId: string;
  op: WorkspaceEntityOperation;
  baseVersion: number | null;
  contentHash: string | null;
  payload: unknown;
  createdAt: number;
  attemptCount: number;
};

export type LocalWorkspaceConflictItem = {
  id: string;
  workspaceId: string;
  clientMutationId: string;
  entityType: WorkspaceEntityType;
  entityId: string;
  serverVersion: number;
  serverContentHash: string | null;
  serverPayload: unknown;
  createdAt: number;
  updatedAt: number;
};

type StoreName =
  | typeof WORKSPACE_SYNC_META_STORE_NAME
  | typeof WORKSPACE_SYNC_OUTBOX_STORE_NAME
  | typeof WORKSPACE_ENTITY_META_STORE_NAME
  | typeof WORKSPACE_SYNC_CONFLICT_STORE_NAME;

export const buildWorkspaceEntityMetaId = (
  workspaceId: string,
  entityType: WorkspaceEntityType,
  entityId: string,
) => `${workspaceId}:${entityType}:${entityId}`;

const isSameWorkspaceEntity = (
  item: LocalWorkspaceOutboxItem,
  input: Pick<LocalWorkspaceOutboxItem, 'workspaceId' | 'entityType' | 'entityId'>,
) =>
  item.workspaceId === input.workspaceId &&
  item.entityType === input.entityType &&
  item.entityId === input.entityId;

const runWithStore = async <T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = runner(store);

    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('事务被中止'));
    tx.oncomplete = () => {
      db.close();
    };
  });
};

export const readWorkspaceSyncMeta = async (
  workspaceId: string,
): Promise<LocalWorkspaceSyncMeta | null> => {
  const meta = await runWithStore<LocalWorkspaceSyncMeta | undefined>(
    WORKSPACE_SYNC_META_STORE_NAME,
    'readonly',
    (store) => store.get(workspaceId),
  );
  return meta ?? null;
};

export const writeWorkspaceSyncMeta = async (meta: LocalWorkspaceSyncMeta): Promise<void> => {
  await runWithStore<IDBValidKey>(WORKSPACE_SYNC_META_STORE_NAME, 'readwrite', (store) =>
    store.put(meta),
  );
};

export const readWorkspaceEntityMeta = async (
  workspaceId: string,
  entityType: WorkspaceEntityType,
  entityId: string,
): Promise<LocalWorkspaceEntityMeta | null> => {
  const meta = await runWithStore<LocalWorkspaceEntityMeta | undefined>(
    WORKSPACE_ENTITY_META_STORE_NAME,
    'readonly',
    (store) => store.get(buildWorkspaceEntityMetaId(workspaceId, entityType, entityId)),
  );
  return meta ?? null;
};

export const writeWorkspaceEntityMeta = async (
  meta: Omit<LocalWorkspaceEntityMeta, 'id'>,
): Promise<void> => {
  await runWithStore<IDBValidKey>(WORKSPACE_ENTITY_META_STORE_NAME, 'readwrite', (store) =>
    store.put({
      id: buildWorkspaceEntityMetaId(meta.workspaceId, meta.entityType, meta.entityId),
      ...meta,
    }),
  );
};

export const enqueueWorkspaceOutboxItem = async (
  input: Omit<LocalWorkspaceOutboxItem, 'id' | 'baseVersion' | 'createdAt' | 'attemptCount'>,
): Promise<LocalWorkspaceOutboxItem> => {
  const entityMeta = await readWorkspaceEntityMeta(
    input.workspaceId,
    input.entityType,
    input.entityId,
  );
  const item = await replacePendingOutboxItem(input, entityMeta?.version ?? null);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WORKSPACE_OUTBOX_ENQUEUED_EVENT));
  }
  return item;
};

const replacePendingOutboxItem = async (
  input: Omit<LocalWorkspaceOutboxItem, 'id' | 'baseVersion' | 'createdAt' | 'attemptCount'>,
  baseVersion: number | null,
): Promise<LocalWorkspaceOutboxItem> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_SYNC_OUTBOX_STORE_NAME, 'readwrite');
    const store = tx.objectStore(WORKSPACE_SYNC_OUTBOX_STORE_NAME);
    const timestamp = Date.now();
    let item: LocalWorkspaceOutboxItem = {
      id: crypto.randomUUID(),
      ...input,
      baseVersion,
      createdAt: timestamp,
      attemptCount: 0,
    };
    const request = store.getAll();

    request.onsuccess = () => {
      const existingItems = Array.isArray(request.result)
        ? (request.result as LocalWorkspaceOutboxItem[])
        : [];
      const pendingItems = existingItems
        .filter((existingItem) => isSameWorkspaceEntity(existingItem, input))
        .sort((a, b) => a.createdAt - b.createdAt);
      const firstPendingItem = pendingItems[0];
      item = {
        ...item,
        baseVersion: firstPendingItem?.baseVersion ?? baseVersion,
        createdAt: firstPendingItem?.createdAt ?? timestamp,
      };
      for (const pendingItem of pendingItems) {
        store.delete(pendingItem.id);
      }
      store.put(item);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('事务被中止'));
    tx.oncomplete = () => {
      db.close();
      resolve(item);
    };
  });
};

export const listWorkspaceOutboxItems = async (
  workspaceId: string,
): Promise<LocalWorkspaceOutboxItem[]> => {
  const items = await runWithStore<LocalWorkspaceOutboxItem[]>(
    WORKSPACE_SYNC_OUTBOX_STORE_NAME,
    'readonly',
    (store) => store.getAll(),
  );
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item.workspaceId === workspaceId)
    .sort((a, b) => a.createdAt - b.createdAt);
};

export const removeWorkspaceOutboxItems = async (ids: string[]): Promise<void> => {
  for (const id of ids) {
    await runWithStore<undefined>(WORKSPACE_SYNC_OUTBOX_STORE_NAME, 'readwrite', (store) =>
      store.delete(id),
    );
  }
};

export const incrementWorkspaceOutboxAttempts = async (
  items: LocalWorkspaceOutboxItem[],
): Promise<void> => {
  for (const item of items) {
    await runWithStore<IDBValidKey>(WORKSPACE_SYNC_OUTBOX_STORE_NAME, 'readwrite', (store) =>
      store.put({
        ...item,
        attemptCount: item.attemptCount + 1,
      }),
    );
  }
};

export const rebaseWorkspaceOutboxItems = async (input: {
  workspaceId: string;
  entityType: WorkspaceEntityType;
  entityId: string;
  baseVersion: number;
}): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_SYNC_OUTBOX_STORE_NAME, 'readwrite');
    const store = tx.objectStore(WORKSPACE_SYNC_OUTBOX_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = Array.isArray(request.result)
        ? (request.result as LocalWorkspaceOutboxItem[])
        : [];
      for (const item of items) {
        if (isSameWorkspaceEntity(item, input)) {
          store.put({
            ...item,
            baseVersion: input.baseVersion,
          });
        }
      }
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('事务被中止'));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
};

export const writeWorkspaceConflicts = async (
  workspaceId: string,
  conflicts: Array<{
    clientMutationId: string;
    entityType: WorkspaceEntityType;
    entityId: string;
    serverVersion: number;
    serverContentHash: string | null;
    serverPayload: unknown;
  }>,
): Promise<void> => {
  const now = Date.now();
  for (const conflict of conflicts) {
    const id = `${workspaceId}:${conflict.clientMutationId}`;
    await runWithStore<IDBValidKey>(WORKSPACE_SYNC_CONFLICT_STORE_NAME, 'readwrite', (store) =>
      store.put({
        id,
        workspaceId,
        createdAt: now,
        updatedAt: now,
        ...conflict,
      } satisfies LocalWorkspaceConflictItem),
    );
  }
};

export const listWorkspaceConflicts = async (
  workspaceId: string,
): Promise<LocalWorkspaceConflictItem[]> => {
  const items = await runWithStore<LocalWorkspaceConflictItem[]>(
    WORKSPACE_SYNC_CONFLICT_STORE_NAME,
    'readonly',
    (store) => store.getAll(),
  );
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item.workspaceId === workspaceId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const removeWorkspaceConflicts = async (ids: string[]): Promise<void> => {
  for (const id of ids) {
    await runWithStore<undefined>(WORKSPACE_SYNC_CONFLICT_STORE_NAME, 'readwrite', (store) =>
      store.delete(id),
    );
  }
};

export const pruneResolvedWorkspaceConflicts = async (
  workspaceId: string,
): Promise<LocalWorkspaceConflictItem[]> => {
  const [conflicts, outboxItems] = await Promise.all([
    listWorkspaceConflicts(workspaceId),
    listWorkspaceOutboxItems(workspaceId),
  ]);
  const pendingMutationIds = new Set(outboxItems.map((item) => item.id));
  const resolvedConflictIds = conflicts
    .filter((conflict) => !pendingMutationIds.has(conflict.clientMutationId))
    .map((conflict) => conflict.id);
  if (resolvedConflictIds.length > 0) {
    await removeWorkspaceConflicts(resolvedConflictIds);
  }
  return conflicts.filter((conflict) => pendingMutationIds.has(conflict.clientMutationId));
};

export const clearWorkspaceSyncState = async (workspaceId: string): Promise<void> => {
  await runWithStore<undefined>(WORKSPACE_SYNC_META_STORE_NAME, 'readwrite', (store) =>
    store.delete(workspaceId),
  );

  const outboxItems = await listWorkspaceOutboxItems(workspaceId);
  await removeWorkspaceOutboxItems(outboxItems.map((item) => item.id));

  const entityMeta = await runWithStore<LocalWorkspaceEntityMeta[]>(
    WORKSPACE_ENTITY_META_STORE_NAME,
    'readonly',
    (store) => store.getAll(),
  );
  const ids = (Array.isArray(entityMeta) ? entityMeta : [])
    .filter((item) => item.workspaceId === workspaceId)
    .map((item) => item.id);
  for (const id of ids) {
    await runWithStore<undefined>(WORKSPACE_ENTITY_META_STORE_NAME, 'readwrite', (store) =>
      store.delete(id),
    );
  }

  const conflicts = await listWorkspaceConflicts(workspaceId);
  await removeWorkspaceConflicts(conflicts.map((item) => item.id));
};
