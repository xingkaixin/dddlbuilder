type IndexedDbRequestOptions = {
  closeDatabase?: boolean;
};

export const runIndexedDbRequest = <T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
  { closeDatabase = true }: IndexedDbRequestOptions = {},
): Promise<T> =>
  new Promise((resolve, reject) => {
    let settled = false;
    let requestSucceeded = false;
    let result: T;

    const close = () => {
      if (closeDatabase && typeof db.close === 'function') db.close();
    };
    const fail = (error: unknown, fallbackMessage: string) => {
      if (settled) return;
      settled = true;
      close();
      reject(error ?? new Error(fallbackMessage));
    };

    try {
      const transaction = db.transaction(storeName, mode);
      transaction.onerror = () => fail(transaction.error, 'IndexedDB 事务失败');
      transaction.onabort = () => fail(transaction.error, 'IndexedDB 事务被中止');
      transaction.oncomplete = () => {
        if (settled) return;
        if (!requestSucceeded) {
          fail(undefined, 'IndexedDB 请求未完成');
          return;
        }
        settled = true;
        close();
        resolve(result);
      };

      const request = runner(transaction.objectStore(storeName));
      request.onsuccess = () => {
        result = request.result;
        requestSucceeded = true;
      };
      request.onerror = () => fail(request.error, 'IndexedDB 请求失败');
    } catch (error) {
      fail(error, 'IndexedDB 操作失败');
    }
  });
