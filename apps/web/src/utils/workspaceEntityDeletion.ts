import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { createEntityId } from '@ddlbuilder/shared-types';
import { runIndexedDbTransaction } from './indexedDbTransaction';
import { getWorkspaceScopeStorageKey } from './workspaceScope';
import {
  openDb,
  type REVIEW_STORE_NAME,
  type VERSION_STORE_NAME,
  WORKSPACE_ENTITY_META_STORE_NAME,
} from './workspaceDb';

export type WorkspaceEntityTarget = {
  scope: WorkspaceScope;
  tableId: string;
  normalizedName: string;
};

export type WorkspaceEntityDeletionStatus = 'deleting' | 'deleted';

export type WorkspaceEntityDeletionMarker = {
  id: string;
  operationId: string;
  createdAt: number;
  scopeKey: string;
  tableId: string;
  normalizedName: string;
  status: WorkspaceEntityDeletionStatus;
};

type HistoryStoreName = typeof REVIEW_STORE_NAME | typeof VERSION_STORE_NAME;

export type WorkspaceEntityWrite = {
  target: WorkspaceEntityTarget;
  mode: 'activate' | 'update';
};

const MARKER_PREFIX = 'saved-table-deletion::';
export const WORKSPACE_ENTITY_DELETION_LEASE_MS = 60_000;

const getWorkspaceEntityDeletionMarkerPrefix = (scope: WorkspaceScope) =>
  `${MARKER_PREFIX}${getWorkspaceScopeStorageKey(scope)}::`;

export const getWorkspaceEntityDeletionMarkerId = (target: WorkspaceEntityTarget) =>
  `${getWorkspaceEntityDeletionMarkerPrefix(target.scope)}table:${target.tableId}`;

export const createWorkspaceEntityDeletionMarker = (
  target: WorkspaceEntityTarget,
  status: WorkspaceEntityDeletionStatus,
  operationId = createEntityId(),
): WorkspaceEntityDeletionMarker => ({
  id: getWorkspaceEntityDeletionMarkerId(target),
  operationId,
  createdAt: Date.now(),
  scopeKey: getWorkspaceScopeStorageKey(target.scope),
  tableId: target.tableId,
  normalizedName: target.normalizedName,
  status,
});

export const isWorkspaceEntityDeletionMarker = (
  value: unknown,
): value is WorkspaceEntityDeletionMarker => {
  if (!value || typeof value !== 'object') return false;
  const marker = value as Partial<WorkspaceEntityDeletionMarker>;
  return (
    typeof marker.id === 'string' &&
    marker.id.startsWith(MARKER_PREFIX) &&
    typeof marker.operationId === 'string' &&
    typeof marker.createdAt === 'number' &&
    typeof marker.scopeKey === 'string' &&
    typeof marker.tableId === 'string' &&
    typeof marker.normalizedName === 'string' &&
    (marker.status === 'deleting' || marker.status === 'deleted')
  );
};

const failRequest = (request: IDBRequest, fail: (error: unknown) => void) =>
  fail(request.error ?? new Error('IndexedDB 请求失败'));

export const readWorkspaceEntityDeletionMarker = (
  store: IDBObjectStore,
  target: WorkspaceEntityTarget,
  fail: (error: unknown) => void,
  done: (marker?: WorkspaceEntityDeletionMarker) => void,
) => {
  const request = store.get(getWorkspaceEntityDeletionMarkerId(target));
  request.onerror = () => failRequest(request, fail);
  request.onsuccess = () => {
    done(isWorkspaceEntityDeletionMarker(request.result) ? request.result : undefined);
  };
};

export async function runWorkspaceEntityHistoryWrite(
  target: WorkspaceEntityTarget,
  storeName: HistoryStoreName,
  write: (store: IDBObjectStore) => void,
): Promise<boolean> {
  const db = await openDb();
  return runIndexedDbTransaction(
    db,
    [WORKSPACE_ENTITY_META_STORE_NAME, storeName],
    'readwrite',
    (tx, fail) => {
      const metaStore = tx.objectStore(WORKSPACE_ENTITY_META_STORE_NAME);
      let persisted = false;
      readWorkspaceEntityDeletionMarker(metaStore, target, fail, (marker) => {
        if (marker) return;
        try {
          write(tx.objectStore(storeName));
          persisted = true;
        } catch (error) {
          fail(error);
        }
      });
      return () => persisted;
    },
  );
}

export const addWorkspaceEntityHistoryRecord = <T extends { id: string }>(
  target: WorkspaceEntityTarget,
  storeName: HistoryStoreName,
  record: T,
) => runWorkspaceEntityHistoryWrite(target, storeName, (store) => store.add(record));

export async function beginWorkspaceEntityDeletion(
  target: WorkspaceEntityTarget,
  commit?: () => void,
): Promise<string> {
  const operationId = createEntityId();
  const db = await openDb();
  await runIndexedDbTransaction(db, WORKSPACE_ENTITY_META_STORE_NAME, 'readwrite', (tx, fail) => {
    const store = tx.objectStore(WORKSPACE_ENTITY_META_STORE_NAME);
    readWorkspaceEntityDeletionMarker(store, target, fail, (marker) => {
      if (marker?.status === 'deleting') {
        fail(new Error('表正在永久删除'));
        return;
      }
      store.put(createWorkspaceEntityDeletionMarker(target, 'deleting', operationId));
    });
    return () => operationId;
  });
  try {
    commit?.();
  } catch (error) {
    await cancelWorkspaceEntityDeletion(target, operationId);
    throw error;
  }
  return operationId;
}

export async function ensureWorkspaceEntityDeletion(
  target: WorkspaceEntityTarget,
): Promise<{ operationId: string; created: boolean }> {
  const operationId = createEntityId();
  let selectedOperationId = operationId;
  let created = true;
  const db = await openDb();
  await runIndexedDbTransaction(db, WORKSPACE_ENTITY_META_STORE_NAME, 'readwrite', (tx, fail) => {
    const store = tx.objectStore(WORKSPACE_ENTITY_META_STORE_NAME);
    readWorkspaceEntityDeletionMarker(store, target, fail, (existing) => {
      if (existing) {
        selectedOperationId = existing.operationId;
        created = false;
        return;
      }
      store.put(createWorkspaceEntityDeletionMarker(target, 'deleting', operationId));
    });
    return () => selectedOperationId;
  });
  return { operationId: selectedOperationId, created };
}

export async function cancelWorkspaceEntityDeletion(
  target: WorkspaceEntityTarget,
  operationId: string,
): Promise<void> {
  const db = await openDb();
  await runIndexedDbTransaction(db, WORKSPACE_ENTITY_META_STORE_NAME, 'readwrite', (tx, fail) => {
    const store = tx.objectStore(WORKSPACE_ENTITY_META_STORE_NAME);
    readWorkspaceEntityDeletionMarker(store, target, fail, (marker) => {
      if (marker?.status === 'deleting' && marker.operationId === operationId) {
        store.delete(marker.id);
      }
    });
    return () => undefined;
  });
}

export const runWorkspaceEntityWrites = async (
  writes: WorkspaceEntityWrite[],
  storeNames: string | string[],
  write: (transaction: IDBTransaction, fail: (error: unknown) => void) => void,
): Promise<void> => {
  if (writes.length === 0) return;
  const uniqueWrites = [
    ...new Map(
      writes.map((entry) => [getWorkspaceEntityDeletionMarkerId(entry.target), entry] as const),
    ).values(),
  ];
  const db = await openDb();
  const stores = [
    ...new Set([
      WORKSPACE_ENTITY_META_STORE_NAME,
      ...(Array.isArray(storeNames) ? storeNames : [storeNames]),
    ]),
  ];
  await runIndexedDbTransaction(db, stores, 'readwrite', (tx, fail) => {
    const metaStore = tx.objectStore(WORKSPACE_ENTITY_META_STORE_NAME);
    const markers: Array<{
      marker?: WorkspaceEntityDeletionMarker;
      mode: WorkspaceEntityWrite['mode'];
    }> = [];
    let remaining = uniqueWrites.length;
    const finishReads = () => {
      remaining -= 1;
      if (remaining !== 0) return;
      if (
        markers.some(
          ({ marker, mode }) =>
            marker?.status === 'deleting' || (mode === 'update' && marker?.status === 'deleted'),
        )
      ) {
        fail(new Error('表正在永久删除'));
        return;
      }
      try {
        write(tx, fail);
        for (const { marker, mode } of markers) {
          if (mode === 'activate' && marker?.status === 'deleted') metaStore.delete(marker.id);
        }
      } catch (error) {
        fail(error);
      }
    };

    for (const { target, mode } of uniqueWrites) {
      const request = metaStore.get(getWorkspaceEntityDeletionMarkerId(target));
      request.onerror = () => failRequest(request, fail);
      request.onsuccess = () => {
        markers.push({
          marker: isWorkspaceEntityDeletionMarker(request.result) ? request.result : undefined,
          mode,
        });
        finishReads();
      };
    }
    return () => undefined;
  });
};

export const commitWorkspaceEntityWrites = async <T>(
  writes: WorkspaceEntityWrite[],
  commit: () => T,
): Promise<T> => {
  // Y.Doc mutations cannot roll back with IndexedDB; finish the marker transaction first.
  await runWorkspaceEntityWrites(writes, [], () => {});
  return commit();
};
