import { vi } from 'vitest';

type RequestHandler = ((event: { target: FakeRequest }) => void) | null;

type FakeRequest = {
  result?: unknown;
  error?: Error;
  onsuccess: RequestHandler;
  onerror: RequestHandler;
};

const createRequest = (): FakeRequest => ({
  result: undefined,
  error: undefined,
  onsuccess: null,
  onerror: null,
});

class FakeIndex {
  private store: FakeObjectStore;
  private indexKey: string;
  private tx: FakeTransaction;

  constructor(store: FakeObjectStore, indexKey: string, tx: FakeTransaction) {
    this.store = store;
    this.indexKey = indexKey;
    this.tx = tx;
  }

  getAll(query?: IDBValidKey) {
    return this.store.getAllByIndex(this.tx, this.indexKey, query);
  }

  openKeyCursor(query: { includes: (key: string) => boolean }) {
    return this.store.openKeyCursor(this.tx, this.indexKey, query);
  }

  count(query?: IDBValidKey) {
    return this.store.countByIndex(this.tx, this.indexKey, query);
  }
}

class FakeObjectStore {
  private data: Map<string, any> = new Map();
  private keyPath: string;
  private indexes: Map<string, string> = new Map();

  constructor(keyPath: string) {
    this.keyPath = keyPath;
  }

  createIndex(name: string, keyPath: string) {
    this.indexes.set(name, keyPath);
    return undefined;
  }

  index(tx: FakeTransaction, name: string) {
    const keyPath = this.indexes.get(name);
    if (!keyPath) {
      throw new Error(`Index ${name} not found`);
    }
    return new FakeIndex(this, keyPath, tx);
  }

  private run<T>(tx: FakeTransaction, operation: () => T, shouldError: (error: Error) => void) {
    const request = createRequest();

    queueMicrotask(() => {
      try {
        const result = operation();
        request.result = result;
        request.onsuccess?.({ target: request });
        // 让 transaction 标记一个 pending request 完成
        tx.markRequestComplete();
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Request failed');
        request.error = err;
        request.onerror?.({ target: request });
        shouldError(err);
      }
    });

    tx.addPendingRequest();
    return request;
  }

  openKeyCursor(
    tx: FakeTransaction,
    indexKey: string,
    query: { includes: (key: string) => boolean },
  ) {
    const request = createRequest();
    const keys = [...this.data.entries()]
      .filter(([, item]) => query.includes(item[indexKey]))
      .map(([primaryKey, item]) => ({ primaryKey, key: item[indexKey] }));
    let position = 0;
    const next = () => {
      tx.addPendingRequest();
      queueMicrotask(() => {
        const entry = keys[position++];
        request.result = entry ? { ...entry, continue: next } : null;
        request.onsuccess?.({ target: request });
        tx.markRequestComplete();
      });
    };
    next();
    return request;
  }

  getAll(tx: FakeTransaction) {
    return this.run(
      tx,
      () => Array.from(this.data.values()),
      () => {
        tx.onerror?.({ target: tx });
      },
    );
  }

  getAllByIndex(tx: FakeTransaction, indexKey: string, query?: IDBValidKey) {
    return this.run(
      tx,
      () => {
        if (query === undefined) {
          return Array.from(this.data.values());
        }
        return Array.from(this.data.values()).filter((item) => item[indexKey] === query);
      },
      () => {
        tx.onerror?.({ target: tx });
      },
    );
  }

  countByIndex(tx: FakeTransaction, indexKey: string, query?: IDBValidKey) {
    return this.run(
      tx,
      () => {
        if (query === undefined) {
          return this.data.size;
        }
        return Array.from(this.data.values()).filter((item) => item[indexKey] === query).length;
      },
      () => {
        tx.onerror?.({ target: tx });
      },
    );
  }

  count(tx: FakeTransaction, query?: IDBValidKey) {
    return this.run(
      tx,
      () => {
        if (query === undefined) {
          return this.data.size;
        }
        // Simplified: only support direct key matching for now as needed by tests
        const key = String(query);
        return this.data.has(key) ? 1 : 0;
      },
      () => {
        tx.onerror?.({ target: tx });
      },
    );
  }

  get(tx: FakeTransaction, key: string) {
    return this.run(
      tx,
      () => this.data.get(key),
      () => {
        tx.onerror?.({ target: tx });
      },
    );
  }

  add(tx: FakeTransaction, value: any) {
    return this.run(
      tx,
      () => {
        const key = String(value?.[this.keyPath] ?? '');
        if (!key || this.data.has(key)) {
          throw new Error('ConstraintError');
        }
        this.data.set(key, value);
        return key;
      },
      () => {
        tx.onerror?.({ target: tx });
      },
    );
  }

  put(tx: FakeTransaction, value: any) {
    return this.run(
      tx,
      () => {
        const key = String(value?.[this.keyPath] ?? '');
        if (!key) {
          throw new Error('ConstraintError');
        }
        this.data.set(key, value);
        return key;
      },
      () => {
        tx.onerror?.({ target: tx });
      },
    );
  }

  delete(tx: FakeTransaction, key: string) {
    return this.run(
      tx,
      () => {
        this.data.delete(key);
        return undefined;
      },
      () => {
        tx.onerror?.({ target: tx });
      },
    );
  }

  clear(tx: FakeTransaction) {
    return this.run(
      tx,
      () => {
        this.data.clear();
        return undefined;
      },
      () => {
        tx.onerror?.({ target: tx });
      },
    );
  }
}

class FakeTransaction {
  onerror: ((event: { target: FakeTransaction }) => void) | null = null;
  onabort: ((event: { target: FakeTransaction }) => void) | null = null;
  oncomplete: ((event: { target: FakeTransaction }) => void) | null = null;
  error: Error | null = null;

  private stores: Map<string, FakeObjectStore>;
  private pendingRequests = 0;
  private completed = false;

  constructor(stores: Map<string, FakeObjectStore>) {
    this.stores = stores;
  }

  addPendingRequest() {
    this.pendingRequests++;
  }

  markRequestComplete() {
    this.pendingRequests--;
    if (this.pendingRequests <= 0 && !this.completed) {
      this.completed = true;
      queueMicrotask(() => this.oncomplete?.({ target: this }));
    }
  }

  objectStore(name?: string) {
    const store = name ? this.stores.get(name) : this.stores.values().next().value;
    if (!store) {
      throw new Error('Store not found');
    }
    return {
      getAll: () => store.getAll(this),
      get: (key: string) => store.get(this, key),
      add: (value: any) => store.add(this, value),
      put: (value: any) => store.put(this, value),
      delete: (key: string) => store.delete(this, key),
      clear: () => store.clear(this),
      count: (query?: IDBValidKey) => store.count(this, query),
      index: (indexName: string) => store.index(this, indexName),
    };
  }
}

class FakeDatabase {
  name: string;
  version: number;
  objectStoreNames: { contains: (name: string) => boolean };
  private stores = new Map<string, FakeObjectStore>();

  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
    this.objectStoreNames = {
      contains: (storeName: string) => this.stores.has(storeName),
    };
  }

  createObjectStore(storeName: string, options: { keyPath: string }) {
    const store = new FakeObjectStore(options.keyPath);
    this.stores.set(storeName, store);
    return store;
  }

  transaction(storeNames: string | string[]) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const transactionStores = new Map<string, FakeObjectStore>();
    for (const name of names) {
      const store = this.stores.get(name);
      if (!store) {
        throw new Error('Store not found');
      }
      transactionStores.set(name, store);
    }
    return new FakeTransaction(transactionStores);
  }

  close() {
    return undefined;
  }
}

class FakeIndexedDB {
  private databases = new Map<string, FakeDatabase>();

  open(name: string, version?: number) {
    const request = createRequest() as FakeRequest & {
      onupgradeneeded?: RequestHandler;
    };
    const existing = this.databases.get(name);
    const targetVersion = version ?? 1;
    const db = existing ?? new FakeDatabase(name, 0);
    if (!existing) {
      this.databases.set(name, db);
    }

    queueMicrotask(() => {
      const oldVersion = db.version;
      const shouldUpgrade = targetVersion > oldVersion;
      if (shouldUpgrade) {
        db.version = targetVersion;
        request.result = db;
        // Create upgrade event with oldVersion
        const upgradeEvent = {
          target: request,
          oldVersion,
          newVersion: targetVersion,
        };
        (request as any).onupgradeneeded?.(upgradeEvent);
      }
      request.result = db;
      request.onsuccess?.({ target: request });
    });

    return request;
  }

  reset() {
    this.databases.clear();
  }

  deleteDatabase(name: string) {
    const request = createRequest();
    queueMicrotask(() => {
      this.databases.delete(name);
      request.onsuccess?.({ target: request });
    });
    return request;
  }
}

export const createFakeIndexedDB = () => new FakeIndexedDB();

export const setupFakeIndexedDB = () => {
  const fake = createFakeIndexedDB();
  Object.defineProperty(globalThis, 'IDBKeyRange', {
    configurable: true,
    value: {
      bound: (lower: string, upper: string) => ({
        includes: (key: string) => key >= lower && key <= upper,
      }),
    },
  });
  Object.defineProperty(globalThis, 'indexedDB', {
    value: fake as unknown,
    configurable: true,
    writable: true,
  });
  return fake;
};

export const teardownFakeIndexedDB = () => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: undefined,
    configurable: true,
    writable: true,
  });
  vi.restoreAllMocks();
};
