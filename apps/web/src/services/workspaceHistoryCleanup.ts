import type * as Y from 'yjs';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { runIndexedDbTransaction } from '@/utils/indexedDbTransaction';
import { getReviewTableKey, isReviewDraftBinding } from '@/utils/reviewHistory';
import { buildScopedWorkspaceKey, getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';
import {
  cancelWorkspaceEntityDeletion,
  createWorkspaceEntityDeletionMarker,
  ensureWorkspaceEntityDeletion,
  getWorkspaceEntityDeletionMarkerId,
  isWorkspaceEntityDeletionMarker,
  readWorkspaceEntityDeletionMarker,
  WORKSPACE_ENTITY_DELETION_LEASE_MS,
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
import {
  listSavedTableMetadataFromYDoc,
  listTrashedSavedTableMetadataFromYDoc,
  subscribeWorkspaceYDoc,
} from './workspaceYDocAdapter';

type SavedTableHistoryTarget = WorkspaceEntityTarget;

type WorkspaceTableSnapshot = {
  tableIds: Set<string>;
};

const HISTORY_STORES = [VERSION_STORE_NAME, REVIEW_STORE_NAME] as const;
const CLEANUP_STORES = [WORKSPACE_ENTITY_META_STORE_NAME, ...HISTORY_STORES] as const;

const failRequest = (request: IDBRequest, fail: (error: unknown) => void) =>
  fail(request.error ?? new Error('IndexedDB 请求失败'));

const historyNormalizedName = (value: unknown) => {
  if (!value || typeof value !== 'object') return '';
  const normalizedName = (value as { tableNormalizedName?: unknown }).tableNormalizedName;
  return typeof normalizedName === 'string' ? normalizedName : '';
};

const historyTargetFromKey = (
  scope: WorkspaceScope,
  storeName: (typeof HISTORY_STORES)[number],
  key: string,
  value: unknown,
): SavedTableHistoryTarget | null => {
  if (storeName === REVIEW_STORE_NAME && !key.startsWith('table:')) return null;
  const tableId = key.startsWith('table:') ? key.slice('table:'.length) : key;
  if (!tableId) return null;
  return {
    scope,
    tableId,
    normalizedName: tableId.startsWith('legacy:')
      ? tableId.slice('legacy:'.length)
      : historyNormalizedName(value),
  };
};

const isCurrentTable = (
  snapshot: WorkspaceTableSnapshot,
  target: Pick<WorkspaceEntityTarget, 'tableId'>,
) => snapshot.tableIds.has(target.tableId);

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

const readWorkspaceDeletionTargets = async (
  scope: WorkspaceScope,
): Promise<SavedTableHistoryTarget[]> => {
  const db = await openDb();
  const scopeKey = getWorkspaceScopeStorageKey(scope);
  const prefix = `${scopeKey}::`;
  const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
  return runIndexedDbTransaction(db, [...CLEANUP_STORES], 'readonly', (tx, fail) => {
    const targets = new Map<string, SavedTableHistoryTarget>();
    const addTarget = (target: SavedTableHistoryTarget) => {
      const id = getWorkspaceEntityDeletionMarkerId(target);
      if (!targets.has(id)) targets.set(id, target);
    };
    const markersRequest: IDBRequest<unknown[]> = tx
      .objectStore(WORKSPACE_ENTITY_META_STORE_NAME)
      .getAll();
    markersRequest.onerror = () => failRequest(markersRequest, fail);
    markersRequest.onsuccess = () => {
      for (const value of markersRequest.result) {
        if (
          !isWorkspaceEntityDeletionMarker(value) ||
          value.scopeKey !== scopeKey ||
          value.status !== 'deleting'
        )
          continue;
        addTarget({
          scope,
          tableId: value.tableId,
          normalizedName: value.normalizedName,
        });
      }
    };

    for (const storeName of HISTORY_STORES) {
      const request = tx.objectStore(storeName).index('tableKey').openCursor(range);
      request.onerror = () => failRequest(request, fail);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.key === 'string') {
          const target = historyTargetFromKey(
            scope,
            storeName,
            cursor.key.slice(prefix.length),
            cursor.value,
          );
          if (target) addTarget(target);
        }
        cursor.continue();
      };
    }
    return () => [...targets.values()];
  });
};

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

const recoverCurrentWorkspaceEntityDeletion = async (
  target: SavedTableHistoryTarget,
): Promise<number | null> => {
  let retryAfterMs: number | null = null;
  const db = await openDb();
  await runIndexedDbTransaction(db, WORKSPACE_ENTITY_META_STORE_NAME, 'readwrite', (tx, fail) => {
    const metaStore = tx.objectStore(WORKSPACE_ENTITY_META_STORE_NAME);
    readWorkspaceEntityDeletionMarker(metaStore, target, fail, (marker) => {
      if (marker?.status !== 'deleting') return;
      const remainingMs =
        WORKSPACE_ENTITY_DELETION_LEASE_MS - Math.max(0, Date.now() - marker.createdAt);
      if (remainingMs > 0) {
        retryAfterMs = remainingMs;
        return;
      }
      metaStore.delete(marker.id);
    });
    return () => retryAfterMs;
  });
  return retryAfterMs;
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

export const watchWorkspaceHistory = (doc: Y.Doc, scope: WorkspaceScope) => {
  const readTables = () => [
    ...listSavedTableMetadataFromYDoc(doc),
    ...listTrashedSavedTableMetadataFromYDoc(doc),
  ];
  const toSnapshot = (): WorkspaceTableSnapshot => {
    const tables = readTables();
    return {
      tableIds: new Set(tables.flatMap((table) => (table.tableId ? [table.tableId] : []))),
    };
  };
  const toTarget = (
    table: ReturnType<typeof readTables>[number],
  ): SavedTableHistoryTarget | null =>
    table.tableId
      ? {
          scope,
          tableId: table.tableId,
          normalizedName: table.normalizedName,
        }
      : null;
  const tableKey = (table: ReturnType<typeof readTables>[number]) =>
    table.tableId ? `table:${table.tableId}` : null;
  const pendingTargets = new Map<string, SavedTableHistoryTarget>();
  let previousTables = readTables();
  let reconciliation = Promise.resolve();
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const reconcile = async () => {
    if (stopped) return;
    let nextRecoveryMs: number | null = null;
    const discoveredTargets = await readWorkspaceDeletionTargets(scope);
    if (stopped) return;
    for (const target of discoveredTargets) {
      const id = getWorkspaceEntityDeletionMarkerId(target);
      if (!pendingTargets.has(id)) pendingTargets.set(id, target);
    }

    for (const [id, target] of pendingTargets) {
      if (stopped) return;
      if (isCurrentTable(toSnapshot(), target)) {
        const retryAfterMs = await recoverCurrentWorkspaceEntityDeletion(target);
        if (retryAfterMs == null) pendingTargets.delete(id);
        else nextRecoveryMs = Math.min(nextRecoveryMs ?? retryAfterMs, retryAfterMs);
        continue;
      }
      const claim = await ensureWorkspaceEntityDeletion(target);
      if (isCurrentTable(toSnapshot(), target)) {
        if (claim.created) {
          await cancelWorkspaceEntityDeletion(target, claim.operationId);
        }
        pendingTargets.delete(id);
        continue;
      }

      await finalizeWorkspaceEntityDeletion(target, claim.operationId);
      pendingTargets.delete(id);
    }

    if (stopped) return;
    if (recoveryTimer) clearTimeout(recoveryTimer);
    recoveryTimer =
      nextRecoveryMs == null
        ? undefined
        : setTimeout(() => {
            recoveryTimer = undefined;
            scheduleReconciliation();
          }, nextRecoveryMs);
  };

  const scheduleReconciliation = () => {
    if (stopped) return;
    reconciliation = reconciliation
      .then(reconcile)
      .catch((error: unknown) => console.error('[workspace] history cleanup failed', error));
  };

  scheduleReconciliation();
  const unsubscribe = subscribeWorkspaceYDoc(doc, () => {
    const currentTables = readTables();
    const currentKeys = new Set(currentTables.map(tableKey));
    for (const table of previousTables) {
      if (currentKeys.has(tableKey(table))) continue;
      const target = toTarget(table);
      if (!target) continue;
      pendingTargets.set(getWorkspaceEntityDeletionMarkerId(target), target);
    }
    previousTables = currentTables;
    scheduleReconciliation();
  }, ['savedTables']);
  return () => {
    stopped = true;
    if (recoveryTimer) clearTimeout(recoveryTimer);
    unsubscribe();
  };
};
