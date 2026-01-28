import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  addSavedTable,
  deleteSavedTable,
  ensureSavedTableName,
  getSavedTable,
  listSavedTables,
  listSavedTableMetadata,
  normalizeSavedTableName,
  updateSavedTable,
  DEFAULT_SAVED_TABLE_NAME,
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
});
