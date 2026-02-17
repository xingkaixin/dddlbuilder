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
  DEFAULT_SAVED_TABLE_NAME,
  STORE_NAME,
} from '@/utils/savedTablesDb';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from './fakeIndexedDb';
import type { PersistedState } from '@/types';

const createState = (
  overrides: Partial<PersistedState> = {},
): PersistedState => ({
  tableName: 'test_table',
  tableComment: '测试',
  dbType: 'mysql',
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

    await addSavedTable(record);

    const list = await listSavedTables();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Demo');

    const fetched = await getSavedTable('demo');
    expect(fetched?.state.tableName).toBe('test_table');

    const updated = {
      ...record,
      updatedAt: record.updatedAt + 1000,
      state: createState({ tableName: 'updated_table' }),
    };

    await updateSavedTable(updated);
    const fetchedUpdated = await getSavedTable('demo');
    expect(fetchedUpdated?.state.tableName).toBe('updated_table');

    await deleteSavedTable('demo');
    const afterDelete = await listSavedTables();
    expect(afterDelete).toHaveLength(0);
  });

  it('should reject duplicate add', async () => {
    const record = {
      normalizedName: 'dup',
      name: 'Dup',
      state: createState(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await addSavedTable(record);
    await expect(addSavedTable(record)).rejects.toThrow('ConstraintError');
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
            nullable: '否',
          },
          {
            order: 2,
            fieldName: 'name',
            fieldType: 'varchar',
            fieldComment: '',
            nullable: '是',
          },
        ],
      }),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await addSavedTable(record);

    const metadata = await listSavedTableMetadata();
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
      onupgradeneeded: null | (() => void);
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
      onupgradeneeded: null | (() => void);
      transaction: { objectStore: (storeName: string) => unknown };
    } = {
      result: db,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      transaction: {
        objectStore: () => tableStore,
      },
    };

    Object.defineProperty(globalThis, 'indexedDB', {
      value: {
        open: vi.fn(() => {
          queueMicrotask(() => {
            request.onupgradeneeded?.();
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
    expect(tableStore.createIndex).toHaveBeenCalledWith(
      'folderId',
      'folderId',
      {
        unique: false,
      },
    );
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
});
