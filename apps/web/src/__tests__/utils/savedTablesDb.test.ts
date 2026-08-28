import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  addSavedTable,
  deleteSavedTable,
  ensureSavedTableName,
  getSavedTable,
  listSavedTables,
  listSavedTableMetadata,
  normalizeSavedTableName,
  openDb,
  updateSavedTable,
  updateSavedTables,
  DEFAULT_SAVED_TABLE_NAME,
  STORE_NAME,
} from '@/utils/savedTablesDb';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from './fakeIndexedDb';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';

const anonymousScope = getAnonymousWorkspaceScope();

const createState = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  schemaName: '',
  tableName: 'test_table',
  tableComment: '测试',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 1,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
  ...overrides,
});

describe('savedTablesDb', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
  });

  it('should normalize and ensure name', () => {
    expect(normalizeSavedTableName('  FooBar ')).toBe('foobar');
    expect(ensureSavedTableName('')).toBe(DEFAULT_SAVED_TABLE_NAME);
    expect(ensureSavedTableName('  Demo ')).toBe('Demo');
  });

  it('should add, get, list, update and delete records', async () => {
    const record = {
      normalizedName: 'demo',
      name: 'Demo',
      state: createState(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await addSavedTable(record, anonymousScope);

    const list = await listSavedTables(anonymousScope);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Demo');

    const fetched = await getSavedTable('demo', anonymousScope);
    expect(fetched?.state.tableName).toBe('test_table');

    const updated = {
      ...record,
      updatedAt: record.updatedAt + 1000,
      state: createState({ tableName: 'updated_table' }),
    };

    await updateSavedTable(updated, anonymousScope);
    const fetchedUpdated = await getSavedTable('demo', anonymousScope);
    expect(fetchedUpdated?.state.tableName).toBe('updated_table');

    await deleteSavedTable('demo', anonymousScope);
    const afterDelete = await listSavedTables(anonymousScope);
    expect(afterDelete).toHaveLength(0);
  });

  it('updates multiple saved tables in one batch', async () => {
    const first = {
      normalizedName: 'first',
      name: 'First',
      state: createState({ tableName: 'first' }),
      createdAt: 1,
      updatedAt: 1,
    };
    const second = {
      normalizedName: 'second',
      name: 'Second',
      state: createState({ tableName: 'second' }),
      createdAt: 1,
      updatedAt: 1,
    };
    await addSavedTable(first, anonymousScope);
    await addSavedTable(second, anonymousScope);

    await updateSavedTables(
      [
        { ...first, folderId: 'folder-1', updatedAt: 2 },
        { ...second, folderId: 'folder-1', updatedAt: 2 },
      ],
      anonymousScope,
    );

    expect(await getSavedTable('first', anonymousScope)).toMatchObject({
      folderId: 'folder-1',
      updatedAt: 2,
    });
    expect(await getSavedTable('second', anonymousScope)).toMatchObject({
      folderId: 'folder-1',
      updatedAt: 2,
    });
  });

  it('should reject duplicate add', async () => {
    const record = {
      normalizedName: 'dup',
      name: 'Dup',
      state: createState(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await addSavedTable(record, anonymousScope);
    await expect(addSavedTable(record, anonymousScope)).rejects.toThrow('ConstraintError');
  });

  it('should list metadata without loading full state', async () => {
    const record = {
      normalizedName: 'meta-test',
      name: 'Meta Test',
      state: createState({
        dbType: 'postgresql',
        rows: [
          {
            order: 1,
            fieldName: 'id',
            fieldType: 'int',
            fieldComment: '',
            nullable: false,
          },
          {
            order: 2,
            fieldName: 'name',
            fieldType: 'varchar',
            fieldComment: '',
            nullable: true,
          },
        ],
      }),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await addSavedTable(record, anonymousScope);

    const metadata = await listSavedTableMetadata(anonymousScope);
    expect(metadata).toHaveLength(1);
    expect(metadata[0].normalizedName).toBe('meta-test');
    expect(metadata[0].name).toBe('Meta Test');
    expect(metadata[0].dbType).toBe('postgresql');
    expect(metadata[0].fieldCount).toBe(2);
    expect(metadata[0]).not.toHaveProperty('state');
  });

  it('should reject when indexedDB is unavailable', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    await expect(openDb()).rejects.toThrow('IndexedDB 不可用');
  });

  it('should fallback to default open error when request.error is null', async () => {
    const request: {
      result?: unknown;
      error: unknown;
      onsuccess: null | (() => void);
      onerror: null | (() => void);
      onupgradeneeded: null | ((event: IDBVersionChangeEvent) => void);
      transaction?: unknown;
    } = {
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };

    Object.defineProperty(globalThis, 'indexedDB', {
      value: {
        open: vi.fn(() => {
          queueMicrotask(() => request.onerror?.());
          return request;
        }),
      },
      configurable: true,
      writable: true,
    });

    await expect(openDb()).rejects.toThrow('打开 IndexedDB 失败');
  });

  it('should create folderId index during upgrade when missing', async () => {
    const tableStore = {
      indexNames: { contains: vi.fn(() => false) },
      createIndex: vi.fn(),
    };
    const createStore = () => ({
      createIndex: vi.fn(),
      openCursor: () => {
        const cursorRequest = { result: null, onsuccess: null as null | (() => void) };
        queueMicrotask(() => cursorRequest.onsuccess?.());
        return cursorRequest;
      },
    });

    const db = {
      objectStoreNames: {
        contains: (storeName: string) => storeName === STORE_NAME,
      },
      createObjectStore: vi.fn(() => createStore()),
    };

    const request: {
      result: typeof db;
      error: unknown;
      onsuccess: null | (() => void);
      onerror: null | (() => void);
      onupgradeneeded: null | ((event: IDBVersionChangeEvent) => void);
      transaction: { objectStore: (storeName: string) => unknown };
    } = {
      result: db,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      transaction: {
        objectStore: (storeName) => (storeName === STORE_NAME ? tableStore : createStore()),
      },
    };

    Object.defineProperty(globalThis, 'indexedDB', {
      value: {
        open: vi.fn(() => {
          queueMicrotask(() => {
            request.onupgradeneeded?.({ oldVersion: 9 } as IDBVersionChangeEvent);
            request.onsuccess?.();
          });
          return request;
        }),
      },
      configurable: true,
      writable: true,
    });

    const opened = await openDb();
    expect(opened).toBe(db as unknown as IDBDatabase);
    expect(tableStore.createIndex).toHaveBeenCalledWith('folderId', 'folderId', {
      unique: false,
    });
  });

  it('should reject when indexedDB.open throws', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: {
        open: () => {
          throw new Error('boom open');
        },
      },
      configurable: true,
      writable: true,
    });

    await expect(openDb()).rejects.toThrow('boom open');
  });

  const flushMicrotasks = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  it('should handle request.onerror and tx.onabort in runWithStore', async () => {
    let mockTx: any;
    let mockRequest: any;

    const mockDb = {
      transaction: () => mockTx,
      close: vi.fn(),
    };

    const mockOpenRequest: any = {
      result: mockDb,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };

    Object.defineProperty(globalThis, 'indexedDB', {
      value: {
        open: vi.fn(() => {
          queueMicrotask(() => mockOpenRequest.onsuccess?.());
          return mockOpenRequest;
        }),
      },
      configurable: true,
      writable: true,
    });

    // 1. request.onerror fallback
    mockRequest = { onerror: null, onsuccess: null, error: null };
    mockTx = {
      objectStore: () => ({ getAll: () => mockRequest }),
      onerror: null,
      onabort: null,
      oncomplete: null,
    };

    const p1 = listSavedTables(anonymousScope);
    await flushMicrotasks(); // yield to let openDb resolve
    mockRequest.onerror();
    await expect(p1).rejects.toThrow('IndexedDB 请求失败');

    // 2. tx.onabort fallback
    mockRequest = { onerror: null, onsuccess: null, result: [] };
    mockTx = {
      objectStore: () => ({ getAll: () => mockRequest }),
      onerror: null,
      onabort: null,
      oncomplete: null,
      error: null,
    };

    const p2 = listSavedTables(anonymousScope);
    await flushMicrotasks();
    mockTx.onabort();
    await expect(p2).rejects.toThrow('事务被中止');

    // 3. tx.onerror explicit
    mockTx = {
      objectStore: () => ({ getAll: () => mockRequest }),
      onerror: null,
      onabort: null,
      oncomplete: null,
      error: new Error('tx error'),
    };
    const p3 = listSavedTables(anonymousScope);
    await flushMicrotasks();
    mockTx.onerror();
    await expect(p3).rejects.toThrow('tx error');
  });

  it('should handle non-array records returned by indexeddb in list functions', async () => {
    let mockTx: any;
    const mockRequest: any = {
      onerror: null,
      onsuccess: null,
      result: { notArray: true },
    };

    const mockDb = {
      transaction: () => mockTx,
      close: vi.fn(),
    };

    const mockOpenRequest: any = {
      result: mockDb,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };

    Object.defineProperty(globalThis, 'indexedDB', {
      value: {
        open: vi.fn(() => {
          queueMicrotask(() => mockOpenRequest.onsuccess?.());
          return mockOpenRequest;
        }),
      },
      configurable: true,
      writable: true,
    });

    mockTx = {
      objectStore: () => ({ getAll: () => mockRequest }),
      onerror: null,
      onabort: null,
      oncomplete: null,
    };

    const p1 = listSavedTables(anonymousScope);
    await flushMicrotasks();
    mockRequest.onsuccess();
    mockTx.oncomplete();
    expect(await p1).toEqual([]);

    const p2 = listSavedTableMetadata(anonymousScope);
    await flushMicrotasks();
    mockRequest.onsuccess();
    mockTx.oncomplete();
    expect(await p2).toEqual([]);
  });
});
