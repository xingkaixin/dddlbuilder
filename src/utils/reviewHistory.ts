import type { ReviewResult } from '@/hooks/useDDLReview';
import { openDb, REVIEW_STORE_NAME } from './savedTablesDb';

/**
 * 评审记录类型
 */
export type ReviewRecord = {
  id: string;
  tableNormalizedName: string;
  tableName: string;
  ddl: string;
  dbType: string;
  result: ReviewResult;
  createdAt: number;
};

/**
 * 评审记录元数据（不含 DDL 完整内容）
 */
export type ReviewRecordMetadata = {
  id: string;
  tableNormalizedName: string;
  tableName: string;
  dbType: string;
  score: number;
  summary: string;
  createdAt: number;
};

/** 每个表最多保留的评审记录数量 */
export const MAX_REVIEWS_PER_TABLE = 50;

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 运行事务
 */
async function runWithStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REVIEW_STORE_NAME, mode);
    const store = tx.objectStore(REVIEW_STORE_NAME);
    const request = runner(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB 请求失败'));
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('事务被中止'));
  });
}

/**
 * 保存评审记录
 */
export async function saveReview(
  tableNormalizedName: string,
  tableName: string,
  ddl: string,
  dbType: string,
  result: ReviewResult,
): Promise<ReviewRecord> {
  const record: ReviewRecord = {
    id: generateId(),
    tableNormalizedName,
    tableName,
    ddl,
    dbType,
    result,
    createdAt: Date.now(),
  };

  await runWithStore('readwrite', (store) => store.add(record));

  // 自动清理超限记录
  await pruneOldReviews(tableNormalizedName, MAX_REVIEWS_PER_TABLE);

  return record;
}

/**
 * 获取评审历史列表（按时间倒序）
 */
export async function listReviews(
  tableNormalizedName?: string,
): Promise<ReviewRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REVIEW_STORE_NAME, 'readonly');
    const store = tx.objectStore(REVIEW_STORE_NAME);

    let request: IDBRequest<ReviewRecord[]>;
    if (tableNormalizedName) {
      const index = store.index('tableNormalizedName');
      request = index.getAll(tableNormalizedName);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      const records = request.result || [];
      records.sort((a, b) => b.createdAt - a.createdAt);
      resolve(records);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取评审历史元数据列表（轻量级）
 */
export async function listReviewMetadata(
  tableNormalizedName?: string,
): Promise<ReviewRecordMetadata[]> {
  const records = await listReviews(tableNormalizedName);
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

/**
 * 获取单个评审记录
 */
export async function getReview(id: string): Promise<ReviewRecord | null> {
  const result = await runWithStore<ReviewRecord | undefined>(
    'readonly',
    (store) => store.get(id),
  );
  return result ?? null;
}

/**
 * 删除评审记录
 */
export async function deleteReview(id: string): Promise<void> {
  await runWithStore('readwrite', (store) => store.delete(id));
}

/**
 * 清理超出限制的旧评审记录
 */
export async function pruneOldReviews(
  tableNormalizedName: string,
  maxCount: number,
): Promise<number> {
  const records = await listReviews(tableNormalizedName);

  if (records.length <= maxCount) {
    return 0;
  }

  const toDelete = records.slice(maxCount);
  for (const record of toDelete) {
    await deleteReview(record.id);
  }

  return toDelete.length;
}

/**
 * 统计评审记录数量
 */
export async function countReviews(
  tableNormalizedName?: string,
): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REVIEW_STORE_NAME, 'readonly');
    const store = tx.objectStore(REVIEW_STORE_NAME);

    let request: IDBRequest<number>;
    if (tableNormalizedName) {
      const index = store.index('tableNormalizedName');
      request = index.count(tableNormalizedName);
    } else {
      request = store.count();
    }

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
