import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { runIndexedDbTransaction } from '@/utils/indexedDbTransaction';
import { getReviewTableKey, isReviewDraftBinding } from '@/utils/reviewHistory';
import { buildScopedWorkspaceKey, getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';
import {
  createWorkspaceEntityDeletionMarker,
  isWorkspaceEntityDeletionMarker,
  readWorkspaceEntityDeletionMarker,
  type WorkspaceEntityTarget,
} from '@/utils/workspaceEntityDeletion';
import {
  openDb,
  STORE_NAME,
  VERSION_STORE_NAME,
  REVIEW_STORE_NAME,
  WORKSPACE_ENTITY_META_STORE_NAME,
} from '@/utils/workspaceDb';
import { getTableVersionKey } from '@/utils/tableVersions';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';

type SavedTableHistoryTarget = WorkspaceEntityTarget;

const HISTORY_STORES = [VERSION_STORE_NAME, REVIEW_STORE_NAME] as const;
const CLEANUP_STORES = [WORKSPACE_ENTITY_META_STORE_NAME, ...HISTORY_STORES] as const;

// oxlint-disable-next-line anti-slop/no-unknown-parameters
const failRequest = (request: IDBRequest, fail: (error: unknown) => void) =>
  fail(request.error ?? new Error('IndexedDB 请求失败'));

// oxlint-disable anti-slop/no-unknown-parameters
const deleteRecordsByTableKey = (
  transaction: IDBTransaction,
  storeName: (typeof HISTORY_STORES)[number],
  tableKeys: string[],
  fail: (error: unknown) => void,
) => {
  const store = transaction.objectStore(storeName);

  for (const tableKey of tableKeys) {
    const request: IDBRequest<Array<{ id: string }>> = store.index('tableKey').getAll(tableKey);
    request.onerror = () => failRequest(request, fail);
    request.onsuccess = () => {
      for (const record of request.result) store.delete(record.id);
    };
  }
};

const deleteTableHistoryInTransaction = (
  transaction: IDBTransaction,
  target: SavedTableHistoryTarget,
  fail: (error: unknown) => void,
) => {
  deleteRecordsByTableKey(transaction, VERSION_STORE_NAME, [getTableVersionKey(target)], fail);
  deleteRecordsByTableKey(transaction, REVIEW_STORE_NAME, [getReviewTableKey(target)], fail);
};
// oxlint-enable anti-slop/no-unknown-parameters

export const finalizeWorkspaceEntityDeletion = async (
  target: SavedTableHistoryTarget,
  operationId: string,
): Promise<void> => {
  const db = await openDb();
  await runIndexedDbTransaction(db, [...CLEANUP_STORES], 'readwrite', (tx, fail) => {
    const metaStore = tx.objectStore(WORKSPACE_ENTITY_META_STORE_NAME);
    readWorkspaceEntityDeletionMarker(metaStore, target, fail, (marker) => {
      if (marker?.operationId !== operationId) return;
      metaStore.put({ ...marker, status: 'deleted' });
      deleteTableHistoryInTransaction(tx, target, fail);
    });

    return () => undefined;
  });
};

export const deleteIndexedDbSavedTablePermanently = async (
  target: SavedTableHistoryTarget,
): Promise<void> => {
  const db = await openDb();
  await runIndexedDbTransaction(
    db,
    [WORKSPACE_ENTITY_META_STORE_NAME, STORE_NAME, ...HISTORY_STORES],
    'readwrite',
    (tx, fail) => {
      const metaStore = tx.objectStore(WORKSPACE_ENTITY_META_STORE_NAME);
      readWorkspaceEntityDeletionMarker(metaStore, target, fail, (marker) => {
        if (marker?.status === 'deleting') {
          fail(new Error('表正在永久删除'));

          return;
        }

        metaStore.put(createWorkspaceEntityDeletionMarker(target, 'deleted'));
        const tableStore = tx.objectStore(STORE_NAME);
        const tablesRequest: IDBRequest<SavedTableRecord[]> = tableStore.getAll();
        tablesRequest.onerror = () => failRequest(tablesRequest, fail);
        tablesRequest.onsuccess = () => {
          const scopeKey = getWorkspaceScopeStorageKey(target.scope);
          const fallbackKey = buildScopedWorkspaceKey(target.scope, target.normalizedName);
          const legacyTableId = `legacy:${target.normalizedName}`;

          for (const record of tablesRequest.result) {
            const matchesStableId = record.tableId === target.tableId;

            const matchesLegacyName =
              !record.tableId &&
              target.tableId === legacyTableId &&
              record.normalizedName === fallbackKey;

            if (record.scope === scopeKey && (matchesStableId || matchesLegacyName)) {
              tableStore.delete(record.normalizedName);
            }
          }
        };

        deleteTableHistoryInTransaction(tx, target, fail);
      });

      return () => undefined;
    },
  );
};

export const clearWorkspaceHistory = async (scope: WorkspaceScope): Promise<void> => {
  const db = await openDb();
  const scopeKey = getWorkspaceScopeStorageKey(scope);
  const prefix = `${scopeKey}::`;
  const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
  await runIndexedDbTransaction(db, [...CLEANUP_STORES], 'readwrite', (tx, fail) => {
    const metaStore = tx.objectStore(WORKSPACE_ENTITY_META_STORE_NAME);
    const markersRequest: IDBRequest<unknown[]> = metaStore.getAll();
    markersRequest.onerror = () => failRequest(markersRequest, fail);
    markersRequest.onsuccess = () => {
      for (const value of markersRequest.result) {
        if (isReviewDraftBinding(value) && value.scopeKey === scopeKey) {
          metaStore.delete(value.id);
          continue;
        }

        if (isWorkspaceEntityDeletionMarker(value) && value.scopeKey === scopeKey) {
          metaStore.delete(value.id);
        }
      }
    };

    for (const storeName of HISTORY_STORES) {
      const store = tx.objectStore(storeName);
      const request = store.index('tableKey').openKeyCursor(range);
      request.onerror = () => failRequest(request, fail);
      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
    }

    return () => undefined;
  });
};
