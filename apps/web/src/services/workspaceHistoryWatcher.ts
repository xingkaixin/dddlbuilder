import type * as Y from 'yjs';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { runIndexedDbTransaction } from '@/utils/indexedDbTransaction';
import { getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';
import {
  cancelWorkspaceEntityDeletion,
  ensureWorkspaceEntityDeletion,
  getWorkspaceEntityDeletionMarkerId,
  isWorkspaceEntityDeletionMarker,
  readWorkspaceEntityDeletionMarker,
  WORKSPACE_ENTITY_DELETION_LEASE_MS,
  type WorkspaceEntityTarget,
} from '@/utils/workspaceEntityDeletion';
import {
  openDb,
  VERSION_STORE_NAME,
  REVIEW_STORE_NAME,
  WORKSPACE_ENTITY_META_STORE_NAME,
} from '@/utils/workspaceDb';
import {
  listSavedTableMetadataFromYDoc,
  listTrashedSavedTableMetadataFromYDoc,
  subscribeWorkspaceYDoc,
} from './workspaceYDocAdapter';
import { finalizeWorkspaceEntityDeletion } from './workspaceHistoryCleanup';

type SavedTableHistoryTarget = WorkspaceEntityTarget;

type WorkspaceTableSnapshot = {
  tableIds: Set<string>;
};

const HISTORY_STORES = [VERSION_STORE_NAME, REVIEW_STORE_NAME] as const;
const CLEANUP_STORES = [WORKSPACE_ENTITY_META_STORE_NAME, ...HISTORY_STORES] as const;

// oxlint-disable-next-line anti-slop/no-unknown-parameters
const failRequest = (request: IDBRequest, fail: (error: unknown) => void) =>
  fail(request.error ?? new Error('IndexedDB 请求失败'));

// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof
const historyNormalizedName = (value: unknown) => {
  if (!value || typeof value !== 'object') return '';
  // SAFETY: the preceding object check limits this read to an object; the property is validated below.
  const normalizedName = (value as { tableNormalizedName?: unknown }).tableNormalizedName;

  return typeof normalizedName === 'string' ? normalizedName : '';
};
// oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof

// oxlint-disable anti-slop/no-unknown-parameters
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
// oxlint-enable anti-slop/no-unknown-parameters

const isCurrentTable = (
  snapshot: WorkspaceTableSnapshot,
  target: Pick<WorkspaceEntityTarget, 'tableId'>,
) => snapshot.tableIds.has(target.tableId);

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

        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- IndexedDB keys are runtime union values.
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
  const toTarget = (table: ReturnType<typeof readTables>[number]): SavedTableHistoryTarget | null =>
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
    reconciliation = reconciliation.then(reconcile).catch(
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- promise rejection is an external cleanup boundary.
      (error: unknown) => console.error('[workspace] history cleanup failed', error),
    );
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
