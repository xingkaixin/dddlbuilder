type IndexedDbRequestOptions = {
  closeDatabase?: boolean;
};

export const runIndexedDbTransaction = <T>(
  db: IDBDatabase,
  storeNames: string | string[],
  mode: IDBTransactionMode,
  runner: (transaction: IDBTransaction, fail: (error: unknown) => void) => () => T,
  { closeDatabase = true }: IndexedDbRequestOptions = {},
): Promise<T> =>
  new Promise((resolve, reject) => {
    let settled = false;
    let transaction: IDBTransaction | undefined;

    const close = () => {
      if (closeDatabase && typeof db.close === 'function') db.close();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      try {
        transaction?.abort();
      } catch {
        // 已结束的事务不能再次中止，但仍需释放连接。
      }
      close();
      reject(error ?? new Error('IndexedDB 操作失败'));
    };

    try {
      const tx = db.transaction(storeNames, mode);
      transaction = tx;
      tx.onerror = () => fail(tx.error ?? new Error('IndexedDB 事务失败'));
      tx.onabort = () => fail(tx.error ?? new Error('IndexedDB 事务被中止'));
      tx.oncomplete = () => {
        if (settled) return;
        try {
          const result = readResult();
          settled = true;
          close();
          resolve(result);
        } catch (error) {
          fail(error);
        }
      };
      const readResult = runner(tx, fail);
    } catch (error) {
      fail(error);
    }
  });

export const runIndexedDbRequest = <T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
  options: IndexedDbRequestOptions = {},
): Promise<T> =>
  runIndexedDbTransaction(
    db,
    storeName,
    mode,
    (tx, fail) => {
      const request = runner(tx.objectStore(storeName));
      let succeeded = false;
      request.onsuccess = () => {
        succeeded = true;
      };
      request.onerror = () => fail(request.error ?? new Error('IndexedDB 请求失败'));
      return () => {
        if (!succeeded) throw new Error('IndexedDB 请求未完成');
        return request.result;
      };
    },
    options,
  );
