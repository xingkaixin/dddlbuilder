import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { addSavedTable, getSavedTable, updateSavedTableMetadata } from '@/utils/savedTablesDb';
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
  indexes: [],
  authInput: '',
  authObjects: [],
  ...overrides,
});

describe('savedTablesDb', () => {
  it('decodes index kinds from legacy saved tables', async () => {
    const state = createState({
      // SAFETY: This fixture models a legacy index shape accepted by the decoder before kind normalization.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Legacy data is intentionally outside the current index type.
      indexes: [
        {
          id: 'pk',
          name: 'pk_id',
          fields: [{ name: 'id', direction: 'ASC' }],
          unique: false,
          isPrimary: true,
        },
      ] as unknown as PersistedState['indexes'],
    });
    await addSavedTable(
      { normalizedName: 'legacy', name: 'legacy', state, createdAt: 1, updatedAt: 1 },
      anonymousScope,
    );
    const loaded = await getSavedTable('legacy', anonymousScope);
    expect(loaded?.state.indexes[0]).toMatchObject({ kind: 'primary' });
  });

  beforeEach(() => {
    setupFakeIndexedDB();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
  });

  it('merges concurrent metadata updates without replacing schema or other metadata', async () => {
    const record = {
      tableId: 'metadata-table',
      normalizedName: 'metadata',
      name: 'Metadata',
      state: createState({ tableComment: 'saved schema' }),
      folderId: 'original-folder',
      createdAt: 1,
      updatedAt: 1,
    };
    await addSavedTable(record, anonymousScope);

    await Promise.all([
      updateSavedTableMetadata(record, { folderId: undefined, updatedAt: 2 }, anonymousScope),
      updateSavedTableMetadata(record, { trashedAt: 3, updatedAt: 3 }, anonymousScope),
    ]);

    const updated = await getSavedTable(record, anonymousScope);
    expect(updated).toMatchObject({
      name: record.name,
      state: record.state,
      createdAt: record.createdAt,
      trashedAt: 3,
    });
    expect(updated?.folderId).toBeUndefined();
  });
});
