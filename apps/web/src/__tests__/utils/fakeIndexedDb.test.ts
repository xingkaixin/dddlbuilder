import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runIndexedDbRequest, runIndexedDbTransaction } from '@/utils/indexedDbTransaction';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from './fakeIndexedDb';

const DB_NAME = 'fake-indexeddb-transaction-test';
const MARKER_STORE_NAME = 'markers';
const HISTORY_STORE_NAME = 'history';

type RecordValue = {
  id: string;
  status?: string;
};

const openTestDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(MARKER_STORE_NAME, { keyPath: 'id' });
      request.result.createObjectStore(HISTORY_STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
  });

const readRecord = async (storeName: string, id: string) => {
  const db = await openTestDb();
  return runIndexedDbRequest<RecordValue | undefined>(db, storeName, 'readonly', (store) =>
    store.get(id),
  );
};

describe('fakeIndexedDb', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
  });

  it('约束失败时回滚同一事务内的 marker 和历史变更', async () => {
    const initialDb = await openTestDb();
    await runIndexedDbTransaction(
      initialDb,
      [MARKER_STORE_NAME, HISTORY_STORE_NAME],
      'readwrite',
      (transaction) => {
        transaction.objectStore(MARKER_STORE_NAME).put({ id: 'table', status: 'deleting' });
        transaction.objectStore(HISTORY_STORE_NAME).put({ id: 'history' });
        transaction.objectStore(HISTORY_STORE_NAME).put({ id: 'duplicate' });
        return () => undefined;
      },
    );

    const failingDb = await openTestDb();
    await expect(
      runIndexedDbTransaction(
        failingDb,
        [MARKER_STORE_NAME, HISTORY_STORE_NAME],
        'readwrite',
        (transaction) => {
          transaction.objectStore(MARKER_STORE_NAME).put({ id: 'table', status: 'deleted' });
          transaction.objectStore(HISTORY_STORE_NAME).delete('history');
          transaction.objectStore(HISTORY_STORE_NAME).add({ id: 'duplicate' });
          return () => undefined;
        },
      ),
    ).rejects.toHaveProperty('name', 'ConstraintError');

    await expect(readRecord(MARKER_STORE_NAME, 'table')).resolves.toEqual({
      id: 'table',
      status: 'deleting',
    });
    await expect(readRecord(HISTORY_STORE_NAME, 'history')).resolves.toEqual({
      id: 'history',
    });
  });
});
