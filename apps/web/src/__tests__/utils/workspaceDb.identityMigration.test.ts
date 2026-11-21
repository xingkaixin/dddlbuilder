import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { getSavedTable, listSavedTableMetadata, replaceSavedTable } from '@/utils/savedTablesDb';
import { listReviews, type ReviewRecord } from '@/utils/reviewHistory';
import { listVersions } from '@/utils/tableVersions';
import { deleteIndexedDbSavedTablePermanently } from '@/services/workspaceHistoryCleanup';
import { openDb, REVIEW_STORE_NAME, STORE_NAME, VERSION_STORE_NAME } from '@/utils/workspaceDb';
import type { TableVersion } from '@/utils/workspaceStorageTypes';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from './fakeIndexedDb';

const scope: WorkspaceScope = { kind: 'anonymous' };
const userScope: WorkspaceScope = { kind: 'user', userId: 'user', workspaceId: 'workspace' };
const userScopeKey = 'user:user:workspace:workspace';
const state: PersistedState = {
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 1,
  indexes: [],
  authInput: '',
  authObjects: [],
};
const table = (normalizedName: string, recordScope = 'anonymous', tableId?: string) => ({
  normalizedName: `${recordScope}::${normalizedName}`,
  scope: recordScope,
  tableId,
  name: normalizedName,
  state,
  createdAt: 1,
  updatedAt: 1,
});
const versionRecord = (
  id: string,
  tableId?: string,
  tableKey?: string,
  name = 'users',
): TableVersion => ({
  id,
  tableId,
  tableKey,
  tableNormalizedName: name,
  state,
  createdAt: 1,
});
const reviewRecord = (
  id: string,
  tableId?: string,
  tableKey?: string,
  name = 'users',
): ReviewRecord => ({
  id,
  tableId,
  tableKey,
  tableNormalizedName: name,
  tableName: name,
  ddl: 'CREATE TABLE users (id INT)',
  dbType: 'mysql',
  result: { score: 8, summary: '', suggestions: [] },
  createdAt: 1,
});

async function createOldDatabase(
  version: number,
  tables: ReturnType<typeof table>[],
  versions: TableVersion[],
  reviews: ReviewRecord[],
) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ddlbuilder', version);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'normalizedName' });
      request.result.createObjectStore('workspace_entity_meta', { keyPath: 'id' });

      for (const name of [VERSION_STORE_NAME, REVIEW_STORE_NAME]) {
        const store = request.result.createObjectStore(name, { keyPath: 'id' });
        store.createIndex('tableNormalizedName', 'tableNormalizedName');

        if (version >= 15) store.createIndex('tableKey', 'tableKey');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, VERSION_STORE_NAME, REVIEW_STORE_NAME], 'readwrite');
    tables.forEach((record) => tx.objectStore(STORE_NAME).put(record));
    versions.forEach((record) => tx.objectStore(VERSION_STORE_NAME).put(record));
    reviews.forEach((record) => tx.objectStore(REVIEW_STORE_NAME).put(record));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function readRawHistory<T>(storeName: string) {
  const db = await openDb();

  try {
    return await new Promise<T[]>((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

describe('legacy saved table identity migration', () => {
  beforeEach(() => setupFakeIndexedDB());
  afterEach(() => teardownFakeIndexedDB());

  it('upgrades an ID-less v14 table and deletes its versions with the same identity', async () => {
    await createOldDatabase(14, [table('users')], [versionRecord('old')], [reviewRecord('old')]);
    const saved = await getSavedTable('users', scope);
    const upgraded = await openDb();
    expect(
      upgraded.transaction(STORE_NAME).objectStore(STORE_NAME).indexNames.contains('folderId'),
    ).toBe(true);
    upgraded.close();
    const target = { scope, normalizedName: 'users', tableId: saved?.tableId ?? '' };
    expect(saved?.tableId).toBe('legacy:users');
    expect((await listSavedTableMetadata(scope))[0].tableId).toBe(target.tableId);
    expect((await listVersions(target)).map((record) => record.id)).toEqual(['old']);
    expect((await listReviews(target)).map((record) => record.id)).toEqual(['old']);
    await deleteIndexedDbSavedTablePermanently(target);
    expect(await getSavedTable('users', scope)).toBeNull();
    expect(await readRawHistory<TableVersion>(VERSION_STORE_NAME)).toEqual([]);
    expect(
      (await readRawHistory<ReviewRecord>(REVIEW_STORE_NAME)).map((record) => record.id),
    ).toEqual(['old']);
  });

  it('keeps an already persisted ID and brings its old and new histories together before renaming', async () => {
    const tableId = 'legacy:anonymous::users';
    await createOldDatabase(
      15,
      [table('users', 'anonymous', tableId)],
      [
        versionRecord('old', 'legacy:users', 'anonymous::legacy:users'),
        versionRecord('new', tableId, `anonymous::${tableId}`),
      ],
      [
        reviewRecord('old', 'legacy:users', 'anonymous::legacy:users'),
        reviewRecord('new', tableId, `anonymous::table:${tableId}`),
      ],
    );
    const saved = await getSavedTable('users', scope);

    if (!saved) throw new Error('Missing saved table');
    const target = { scope, tableId, normalizedName: 'users' };
    expect(saved.tableId).toBe(tableId);
    expect((await listVersions(target)).map((record) => record.id).sort()).toEqual(['new', 'old']);
    const migratedReviews = await listReviews(target);
    expect(migratedReviews.map((record) => record.id).sort()).toEqual(['new', 'old']);
    expect(migratedReviews.find((record) => record.id === 'old')).toMatchObject({
      id: 'old',
      tableId,
      tableKey: `anonymous::table:${tableId}`,
      tableName: 'users',
      ddl: 'CREATE TABLE users (id INT)',
      dbType: 'mysql',
      result: { score: 8, summary: '', suggestions: [] },
    });
    await replaceSavedTable(
      'users',
      { ...saved, normalizedName: 'accounts', name: 'Accounts' },
      scope,
    );
    const renamedTarget = { ...target, normalizedName: 'accounts' };
    expect((await getSavedTable(renamedTarget, scope))?.tableId).toBe(tableId);
    expect(await listVersions(renamedTarget)).toHaveLength(2);
    expect(await listReviews(renamedTarget)).toHaveLength(2);
    const histories = await readRawHistory<TableVersion>(VERSION_STORE_NAME);
    expect(await readRawHistory<TableVersion>(VERSION_STORE_NAME)).toEqual(histories);
    await deleteIndexedDbSavedTablePermanently(renamedTarget);
    expect(await getSavedTable(renamedTarget, scope)).toBeNull();
    expect(await readRawHistory<TableVersion>(VERSION_STORE_NAME)).toEqual([]);
    expect(await readRawHistory<ReviewRecord>(REVIEW_STORE_NAME)).toEqual([]);
  });

  it('does not reassign legacy history to same-name replacement tables or another scope', async () => {
    await createOldDatabase(
      15,
      [table('users', 'anonymous', 'replacement-id'), table('users', userScopeKey, 'user-table')],
      [
        versionRecord('old', 'legacy:users', 'anonymous::legacy:users'),
        versionRecord('user', 'user-table', `${userScopeKey}::user-table`),
      ],
      [
        reviewRecord('old', 'legacy:users', 'anonymous::legacy:users'),
        reviewRecord('user', 'user-table', `${userScopeKey}::user-table`),
      ],
    );
    expect((await getSavedTable('users', scope))?.tableId).toBe('replacement-id');
    expect(
      await listVersions({ scope, tableId: 'replacement-id', normalizedName: 'users' }),
    ).toEqual([]);
    expect(
      await listReviews({ scope, tableId: 'replacement-id', normalizedName: 'users' }),
    ).toEqual([]);
    await deleteIndexedDbSavedTablePermanently({
      scope,
      tableId: 'legacy:users',
      normalizedName: 'users',
    });
    expect((await getSavedTable('users', scope))?.tableId).toBe('replacement-id');
    expect((await getSavedTable('users', userScope))?.tableId).toBe('user-table');
    expect(
      (
        await listVersions({ scope: userScope, tableId: 'user-table', normalizedName: 'users' })
      ).map((record) => record.id),
    ).toEqual(['user']);
    expect(
      (await readRawHistory<ReviewRecord>(REVIEW_STORE_NAME)).map((record) => record.id),
    ).toEqual(['old', 'user']);
  });
});
