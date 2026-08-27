import {
  normalizeDDLReviewResult,
  type DDLReviewResult as ReviewResult,
} from '@ddlbuilder/shared-types/ddl-review';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { openDb, REVIEW_STORE_NAME } from './workspaceDb';
import { runIndexedDbRequest } from './indexedDbTransaction';
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

const readAndClaimReviews = async (target: ReviewTarget): Promise<ReviewRecord[]> => {
  const db = await openDb();
  const tableKey = getTableKey(target);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REVIEW_STORE_NAME, 'readwrite');
    const store = tx.objectStore(REVIEW_STORE_NAME);
    const scopedRequest = store.index('tableKey').getAll(tableKey);
    const sameNameRequest = store.index('tableNormalizedName').getAll(target.normalizedName);
    let scopedRecords: ReviewRecord[] | null = null;
    let sameNameRecords: ReviewRecord[] | null = null;
    let records: ReviewRecord[] = [];

    const claimLegacyRecords = () => {
      if (!scopedRecords || !sameNameRecords) return;
      const claimed = sameNameRecords
        .filter((record) => !record.tableKey)
        .map((record) => ({
          ...record,
          tableKey,
          tableId: target.tableId,
        }));
      for (const record of claimed) store.put(record);
      records = [...scopedRecords, ...claimed];
    };

    scopedRequest.onsuccess = () => {
      scopedRecords = scopedRequest.result as ReviewRecord[];
      claimLegacyRecords();
    };
    sameNameRequest.onsuccess = () => {
      sameNameRecords = sameNameRequest.result as ReviewRecord[];
      claimLegacyRecords();
    };
    tx.oncomplete = () => {
      db.close();
      resolve(records.map(normalizeReviewRecord).sort((a, b) => b.createdAt - a.createdAt));
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('读取评审历史失败'));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('读取评审历史被中止'));
    };
  });
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
  return readAndClaimReviews(target);
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
  const tableKey = getTableKey(target);
  const result = await runWithStore<ReviewRecord | undefined>('readonly', (store) => store.get(id));
  if (!result) return null;
  if (result.tableKey === tableKey) return normalizeReviewRecord(result);
  if (result.tableKey || result.tableNormalizedName !== target.normalizedName) return null;
  return (await listReviews(target)).find((record) => record.id === id) ?? null;
}

export async function deleteReview(id: string, target: ReviewTarget): Promise<void> {
  if (!(await getReview(id, target))) return;
  await runWithStore<undefined>('readwrite', (store) => store.delete(id));
}

export async function pruneOldReviews(target: ReviewTarget, maxCount: number): Promise<number> {
  const records = await listReviews(target);

  if (records.length <= maxCount) {
    return 0;
  }

  const toDelete = records.slice(maxCount);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REVIEW_STORE_NAME, 'readwrite');
    const store = tx.objectStore(REVIEW_STORE_NAME);

    for (const record of toDelete) {
      store.delete(record.id);
    }

    tx.oncomplete = () => {
      db.close();
      resolve(toDelete.length);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function countReviews(target: ReviewTarget): Promise<number> {
  return (await listReviews(target)).length;
}
