import {
  normalizeDDLReviewResult,
  type DDLReviewResult as ReviewResult,
} from '@ddlbuilder/shared-types/ddl-review';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { openDb, REVIEW_STORE_NAME } from './workspaceDb';
import { runIndexedDbRequest, runIndexedDbTransaction } from './indexedDbTransaction';
import { getWorkspaceScopeStorageKey } from './workspaceScope';

export type ReviewTarget = {
  scope: WorkspaceScope;
  tableId?: string;
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

export const MAX_REVIEWS_PER_TABLE = 50;

const getTableKey = ({ scope, tableId, normalizedName }: ReviewTarget) =>
  `${getWorkspaceScopeStorageKey(scope)}::${tableId ? `table:${tableId}` : `name:${normalizedName}`}`;

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

async function runWithStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return runIndexedDbRequest(db, REVIEW_STORE_NAME, mode, runner);
}

const getReadableKeys = (target: ReviewTarget) => {
  const legacyId = `legacy:${target.normalizedName}`;
  return [
    getTableKey(target),
    ...(target.scope.kind === 'anonymous' && (!target.tableId || target.tableId === legacyId)
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
): Promise<ReviewRecord> {
  const record: ReviewRecord = {
    id: generateId(),
    tableKey: getTableKey(target),
    tableId: target.tableId,
    tableNormalizedName: target.normalizedName,
    tableName,
    ddl,
    dbType,
    result,
    createdAt: Date.now(),
  };

  await runWithStore('readwrite', (store) => store.add(record));

  await pruneOldReviews(target, MAX_REVIEWS_PER_TABLE);

  return record;
}

export async function listReviews(target: ReviewTarget): Promise<ReviewRecord[]> {
  const groups = await Promise.all(
    getReadableKeys(target).map((key) =>
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
  previousName: string,
): Promise<void> {
  const records = await listReviews({
    ...target,
    tableId: undefined,
    normalizedName: previousName,
  });
  if (records.length === 0) return;
  const db = await openDb();
  await runIndexedDbTransaction(db, REVIEW_STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(REVIEW_STORE_NAME);
    for (const record of records)
      store.put({
        ...record,
        tableKey: getTableKey(target),
        tableId: target.tableId,
        tableNormalizedName: target.normalizedName,
      });
    return () => undefined;
  });
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
  const result = await runWithStore<ReviewRecord | undefined>('readonly', (store) => store.get(id));
  return result?.tableKey && getReadableKeys(target).includes(result.tableKey)
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

    for (const record of records) {
      store.delete(record.id);
    }

    return () => undefined;
  });
}

export async function deleteAllReviews(target: ReviewTarget): Promise<void> {
  await deleteReviews(await listReviews(target));
}

export async function pruneOldReviews(target: ReviewTarget, maxCount: number): Promise<number> {
  const records = await listReviews(target);
  const toDelete = records.slice(Math.max(0, maxCount));
  await deleteReviews(toDelete);
  return toDelete.length;
}
