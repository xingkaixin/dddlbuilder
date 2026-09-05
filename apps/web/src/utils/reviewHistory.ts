import {
  normalizeDDLReviewResult,
  type DDLReviewResult as ReviewResult,
} from '@ddlbuilder/shared-types/ddl-review';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { openDb, REVIEW_STORE_NAME, WORKSPACE_ENTITY_META_STORE_NAME } from './workspaceDb';
import { runIndexedDbRequest, runIndexedDbTransaction } from './indexedDbTransaction';
import { getWorkspaceScopeStorageKey } from './workspaceScope';
import {
  getWorkspaceEntityDeletionMarkerId,
  isWorkspaceEntityDeletionMarker,
} from './workspaceEntityDeletion';

export type ReviewTarget = {
  scope: WorkspaceScope;
  tableId?: string;
  draftId?: string;
  normalizedName: string;
};

export type ReviewRecord = {
  id: string;
  tableKey?: string;
  tableId?: string;
  tableNormalizedName: string;
  tableName: string;
  ddl: string;
  dbType: string;
  result: ReviewResult;
  createdAt: number;
};

export type ReviewRecordMetadata = {
  id: string;
  tableNormalizedName: string;
  tableName: string;
  dbType: string;
  score: number;
  summary: string;
  createdAt: number;
};

export type ReviewDraftBinding = {
  id: string;
  scopeKey: string;
  draftId: string;
  tableId: string;
  normalizedName: string;
};

export type ReviewMigrationSource = {
  draftId?: string;
  normalizedName: string;
};

export const MAX_REVIEWS_PER_TABLE = 50;

const DRAFT_BINDING_PREFIX = 'review-draft-binding::';

const getReviewDraftBindingId = (scope: WorkspaceScope, draftId: string) =>
  `${DRAFT_BINDING_PREFIX}${getWorkspaceScopeStorageKey(scope)}::${draftId}`;

export const isReviewDraftBinding = (value: unknown): value is ReviewDraftBinding => {
  if (!value || typeof value !== 'object') return false;
  const binding = value as Partial<ReviewDraftBinding>;
  return (
    typeof binding.id === 'string' &&
    binding.id.startsWith(DRAFT_BINDING_PREFIX) &&
    typeof binding.scopeKey === 'string' &&
    typeof binding.draftId === 'string' &&
    typeof binding.tableId === 'string' &&
    typeof binding.normalizedName === 'string'
  );
};

const createReviewDraftBinding = (
  target: ReviewTarget & { tableId: string },
  draftId: string,
): ReviewDraftBinding => ({
  id: getReviewDraftBindingId(target.scope, draftId),
  scopeKey: getWorkspaceScopeStorageKey(target.scope),
  draftId,
  tableId: target.tableId,
  normalizedName: target.normalizedName,
});

const targetFromBinding = (scope: WorkspaceScope, binding: ReviewDraftBinding): ReviewTarget => ({
  scope,
  tableId: binding.tableId,
  normalizedName: binding.normalizedName,
});

export const getReviewTableKey = ({ scope, tableId, draftId, normalizedName }: ReviewTarget) => {
  if (tableId && draftId) throw new Error('评审目标不能同时包含 tableId 和 draftId');
  return `${getWorkspaceScopeStorageKey(scope)}::${
    tableId ? `table:${tableId}` : draftId ? `draft:${draftId}` : `name:${normalizedName}`
  }`;
};

const normalizeReviewRecord = (record: ReviewRecord): ReviewRecord => ({
  ...record,
  result: normalizeDDLReviewResult(
    record.result,
    typeof record.result?.summary === 'string' ? record.result.summary : '',
  ),
});

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const failRequest = (request: IDBRequest, fail: (error: unknown) => void) =>
  fail(request.error ?? new Error('IndexedDB 请求失败'));

async function runWithStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return runIndexedDbRequest(db, REVIEW_STORE_NAME, mode, runner);
}

const readReviewDraftBinding = (
  store: IDBObjectStore,
  target: ReviewTarget,
  fail: (error: unknown) => void,
  done: (binding?: ReviewDraftBinding) => void,
) => {
  if (target.tableId || !target.draftId) {
    done();
    return;
  }
  const request = store.get(getReviewDraftBindingId(target.scope, target.draftId));
  request.onerror = () => failRequest(request, fail);
  request.onsuccess = () => done(isReviewDraftBinding(request.result) ? request.result : undefined);
};

const resolveReviewTarget = async (target: ReviewTarget): Promise<ReviewTarget | null> => {
  if (!target.tableId && !target.draftId) return target;
  const db = await openDb();
  return runIndexedDbTransaction(db, WORKSPACE_ENTITY_META_STORE_NAME, 'readonly', (tx, fail) => {
    let result: ReviewTarget | null = null;
    const store = tx.objectStore(WORKSPACE_ENTITY_META_STORE_NAME);
    readReviewDraftBinding(store, target, fail, (binding) => {
      const resolvedTarget = binding ? targetFromBinding(target.scope, binding) : target;
      if (!resolvedTarget.tableId) {
        result = resolvedTarget;
        return;
      }
      const markerRequest = store.get(
        getWorkspaceEntityDeletionMarkerId({
          ...resolvedTarget,
          tableId: resolvedTarget.tableId,
        }),
      );
      markerRequest.onerror = () => failRequest(markerRequest, fail);
      markerRequest.onsuccess = () => {
        result =
          isWorkspaceEntityDeletionMarker(markerRequest.result) &&
          markerRequest.result.status === 'deleted'
            ? null
            : resolvedTarget;
      };
    });
    return () => result;
  });
};

export const getReadableReviewTableKeys = (target: ReviewTarget) => {
  const legacyId = `legacy:${target.normalizedName}`;
  return [
    getReviewTableKey(target),
    ...(target.scope.kind === 'anonymous' &&
    !target.draftId &&
    (!target.tableId || target.tableId === legacyId)
      ? [`anonymous::${legacyId}`]
      : []),
  ];
};

export async function saveReview(
  target: ReviewTarget,
  tableName: string,
  ddl: string,
  dbType: string,
  result: ReviewResult,
  isCurrentDocument: () => boolean = () => true,
): Promise<ReviewRecord | null> {
  const db = await openDb();
  const saved = await runIndexedDbTransaction(
    db,
    [WORKSPACE_ENTITY_META_STORE_NAME, REVIEW_STORE_NAME],
    'readwrite',
    (tx, fail) => {
      let persisted: { record: ReviewRecord; target: ReviewTarget } | null = null;
      const metaStore = tx.objectStore(WORKSPACE_ENTITY_META_STORE_NAME);
      const persist = (resolvedTarget: ReviewTarget) => {
        if (!isCurrentDocument()) return;
        const record: ReviewRecord = {
          id: generateId(),
          tableKey: getReviewTableKey(resolvedTarget),
          tableId: resolvedTarget.tableId,
          tableNormalizedName: resolvedTarget.normalizedName,
          tableName,
          ddl,
          dbType,
          result,
          createdAt: Date.now(),
        };
        const request = tx.objectStore(REVIEW_STORE_NAME).add(record);
        request.onerror = () => failRequest(request, fail);
        persisted = { record, target: resolvedTarget };
      };
      readReviewDraftBinding(metaStore, target, fail, (binding) => {
        const resolvedTarget = binding ? targetFromBinding(target.scope, binding) : target;
        if (!resolvedTarget.tableId) {
          persist(resolvedTarget);
          return;
        }
        const stableTarget = { ...resolvedTarget, tableId: resolvedTarget.tableId };
        const markerRequest = metaStore.get(getWorkspaceEntityDeletionMarkerId(stableTarget));
        markerRequest.onerror = () => failRequest(markerRequest, fail);
        markerRequest.onsuccess = () => {
          if (!isWorkspaceEntityDeletionMarker(markerRequest.result)) persist(stableTarget);
        };
      });
      return () => persisted;
    },
  );

  if (!saved) return null;
  await pruneOldReviews(saved.target, MAX_REVIEWS_PER_TABLE);
  return saved.record;
}

export async function listReviews(target: ReviewTarget): Promise<ReviewRecord[]> {
  const resolvedTarget = await resolveReviewTarget(target);
  if (!resolvedTarget) return [];
  const groups = await Promise.all(
    getReadableReviewTableKeys(resolvedTarget).map((key) =>
      runWithStore<ReviewRecord[]>('readonly', (store) => store.index('tableKey').getAll(key)),
    ),
  );
  return groups
    .flat()
    .map(normalizeReviewRecord)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function migrateReviewsToTable(
  target: ReviewTarget & { tableId: string },
  source: ReviewMigrationSource,
): Promise<void> {
  const sourceTarget: ReviewTarget = {
    scope: target.scope,
    draftId: source.draftId,
    normalizedName: source.normalizedName,
  };
  const sourceKey = getReviewTableKey(sourceTarget);
  const db = await openDb();
  await runIndexedDbTransaction(
    db,
    [WORKSPACE_ENTITY_META_STORE_NAME, REVIEW_STORE_NAME],
    'readwrite',
    (tx, fail) => {
      const metaStore = tx.objectStore(WORKSPACE_ENTITY_META_STORE_NAME);
      const reviewStore = tx.objectStore(REVIEW_STORE_NAME);
      const migrate = () => {
        const markerRequest = metaStore.get(getWorkspaceEntityDeletionMarkerId(target));
        markerRequest.onerror = () => failRequest(markerRequest, fail);
        markerRequest.onsuccess = () => {
          const deleted =
            isWorkspaceEntityDeletionMarker(markerRequest.result) &&
            markerRequest.result.status === 'deleted';
          const recordsRequest: IDBRequest<ReviewRecord[]> = reviewStore
            .index('tableKey')
            .getAll(sourceKey);
          recordsRequest.onerror = () => failRequest(recordsRequest, fail);
          recordsRequest.onsuccess = () => {
            for (const record of recordsRequest.result) {
              if (deleted) {
                reviewStore.delete(record.id);
                continue;
              }
              reviewStore.put({
                ...record,
                tableKey: getReviewTableKey(target),
                tableId: target.tableId,
                tableNormalizedName: target.normalizedName,
              });
            }
          };
        };
      };
      const draftId = source.draftId;
      if (!draftId) {
        migrate();
        return () => undefined;
      }
      const bindingId = getReviewDraftBindingId(target.scope, draftId);
      const bindingRequest = metaStore.get(bindingId);
      bindingRequest.onerror = () => failRequest(bindingRequest, fail);
      bindingRequest.onsuccess = () => {
        const existing = isReviewDraftBinding(bindingRequest.result)
          ? bindingRequest.result
          : undefined;
        if (existing && existing.tableId !== target.tableId) {
          fail(new Error('评审草稿已绑定到其他表'));
          return;
        }
        metaStore.put(createReviewDraftBinding(target, draftId));
        migrate();
      };
      return () => undefined;
    },
  );
}

export async function listReviewMetadata(target: ReviewTarget): Promise<ReviewRecordMetadata[]> {
  const records = await listReviews(target);
  return records.map((r) => ({
    id: r.id,
    tableNormalizedName: r.tableNormalizedName,
    tableName: r.tableName,
    dbType: r.dbType,
    score: r.result.score,
    summary: r.result.summary,
    createdAt: r.createdAt,
  }));
}

export async function getReview(id: string, target: ReviewTarget): Promise<ReviewRecord | null> {
  const [result, resolvedTarget] = await Promise.all([
    runWithStore<ReviewRecord | undefined>('readonly', (store) => store.get(id)),
    resolveReviewTarget(target),
  ]);
  return resolvedTarget &&
    result?.tableKey &&
    getReadableReviewTableKeys(resolvedTarget).includes(result.tableKey)
    ? normalizeReviewRecord(result)
    : null;
}

export async function deleteReview(id: string, target: ReviewTarget): Promise<void> {
  if (!(await getReview(id, target))) return;
  await runWithStore<undefined>('readwrite', (store) => store.delete(id));
}

async function deleteReviews(records: ReviewRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await openDb();
  await runIndexedDbTransaction(db, REVIEW_STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(REVIEW_STORE_NAME);

    for (const record of records) store.delete(record.id);

    return () => undefined;
  });
}

export async function pruneOldReviews(target: ReviewTarget, maxCount: number): Promise<number> {
  const records = await listReviews(target);
  const toDelete = records.slice(Math.max(0, maxCount));
  await deleteReviews(toDelete);
  return toDelete.length;
}
