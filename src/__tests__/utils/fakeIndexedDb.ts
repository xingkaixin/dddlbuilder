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

class FakeObjectStore {
  private data: Map<string, any> = new Map();
  private keyPath: string;

  constructor(keyPath: string) {
    this.keyPath = keyPath;
  }

  createIndex() {
    return undefined;
  }

  private run<T>(
    tx: FakeTransaction,
    operation: () => T,
    shouldError: (error: Error) => void,
  ) {
    const request = createRequest();

    queueMicrotask(() => {
      try {
        const result = operation();
        request.result = result;
        request.onsuccess?.({ target: request });
        queueMicrotask(() => tx.oncomplete?.({ target: tx }));
      } catch (error) {
        const err =
          error instanceof Error ? error : new Error('Request failed');
        request.error = err;
        request.onerror?.({ target: request });
        shouldError(err);
      }
    });

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
}

class FakeTransaction {
  onerror: ((event: { target: FakeTransaction }) => void) | null = null;
  onabort: ((event: { target: FakeTransaction }) => void) | null = null;
  oncomplete: ((event: { target: FakeTransaction }) => void) | null = null;
  error: Error | null = null;

  private store: FakeObjectStore;

  constructor(store: FakeObjectStore) {
    this.store = store;
  }

  objectStore() {
    return {
      getAll: () => this.store.getAll(this),
      get: (key: string) => this.store.get(this, key),
      add: (value: any) => this.store.add(this, value),
      put: (value: any) => this.store.put(this, value),
      delete: (key: string) => this.store.delete(this, key),
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

  transaction(storeName: string) {
    const store = this.stores.get(storeName);
    if (!store) {
      throw new Error('Store not found');
    }
    return new FakeTransaction(store);
  }

  close() {
    return undefined;
  }
}

class FakeIndexedDB {
  private databases = new Map<string, FakeDatabase>();

  open(name: string, version?: number) {
    const request = createRequest();
    const existing = this.databases.get(name);
    const db = existing ?? new FakeDatabase(name, version ?? 1);
    if (!existing) {
      this.databases.set(name, db);
    }

    queueMicrotask(() => {
      const shouldUpgrade = version && version > db.version;
      if (shouldUpgrade) {
        db.version = version;
        request.result = db;
        request.onupgradeneeded?.({ target: request });
      } else if (!db.objectStoreNames.contains('saved_tables')) {
        request.result = db;
        request.onupgradeneeded?.({ target: request });
      }
      request.result = db;
      request.onsuccess?.({ target: request });
    });

    return request;
  }

  reset() {
    this.databases.clear();
  }
}

export const createFakeIndexedDB = () => new FakeIndexedDB();

export const setupFakeIndexedDB = () => {
  const fake = createFakeIndexedDB();
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
