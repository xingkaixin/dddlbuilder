import * as Y from 'yjs';
import { watchWorkspaceHistory } from '@/services/workspaceHistoryCleanup';
import { upsertSavedTableInYDoc, deleteSavedTableFromYDoc } from '@/services/workspaceYDocAdapter';
import { createVersion, listVersions } from '@/utils/tableVersions';
import { saveReview, listReviews } from '@/utils/reviewHistory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import {
  clearLegacyWorkspaceData,
  clearLocalWorkspaceData,
  fetchCurrentWorkspace,
} from '@/services/workspaceAccountService';
import { addSavedTable, listSavedTables } from '@/utils/savedTablesDb';
import { bulkPutFolders, listFolders } from '@/utils/tableFolders';
import { readDraft, writeDraft } from '@/utils/workspaceStateDb';

const scope = { kind: 'user' as const, userId: 'user-1', workspaceId: 'ws-1' };

const createState = (tableName: string) => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql' as const,
  sqlFormatMode: 'compact' as const,
  rows: [],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('workspaceAccountService', () => {
  it('cleans history after a remote permanent deletion and retains trashed tables', async () => {
    const doc = new Y.Doc();
    const remote = new Y.Doc();
    const deleted = { scope, tableId: 'deleted', normalizedName: 'deleted' };
    const trashed = { scope, tableId: 'trashed', normalizedName: 'trashed' };
    for (const target of [deleted, trashed]) {
      upsertSavedTableInYDoc(doc, {
        tableId: target.tableId,
        normalizedName: target.normalizedName,
        name: target.normalizedName,
        state: createState(target.normalizedName),
        createdAt: 1,
        updatedAt: 1,
        ...(target === trashed ? { trashedAt: 2 } : {}),
      });
      await createVersion(target, createState(target.normalizedName));
    }
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    const stop = watchWorkspaceHistory(doc, scope);
    deleteSavedTableFromYDoc(remote, deleted);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), 'remote');
    await vi.waitFor(async () => expect(await listVersions(deleted)).toEqual([]));
    expect(await listVersions(trashed)).toHaveLength(1);
    stop();
    doc.destroy();
    remote.destroy();
  });

  it('preserves history while cleaning migrated legacy table snapshots', async () => {
    const target = { scope, tableId: 'kept', normalizedName: 'kept' };
    await createVersion(target, createState('kept'));
    await clearLegacyWorkspaceData(scope);
    expect(await listVersions(target)).toHaveLength(1);
  });

  it('clears account history including records whose tables no longer exist', async () => {
    const target = { scope, tableId: 'orphan', normalizedName: 'gone' };
    const other = { ...target, scope: { ...scope, userId: 'another' } };
    const review = { score: 8, summary: 'review', suggestions: [] };
    await createVersion(target, createState('gone'));
    await saveReview(target, 'gone', 'ddl', 'mysql', review);
    await createVersion(other, createState('other'));
    await clearLocalWorkspaceData(scope);
    const versions = await listVersions(target);
    const reviews = await listReviews(target);
    expect(versions).toEqual([]);
    expect(reviews).toEqual([]);
    expect(await listVersions(other)).toHaveLength(1);
  });

  beforeEach(() => {
    setupFakeIndexedDB();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
    vi.restoreAllMocks();
  });

  it('reads the current workspace identifier', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ workspaceId: 'ws-1' })),
    );

    await expect(fetchCurrentWorkspace()).resolves.toMatchObject({ workspaceId: 'ws-1' });
  });

  it('moves legacy partitions without touching anonymous data or deleting the target Y.Doc', async () => {
    const legacy = { kind: 'legacy_user' as const, userId: scope.userId };
    const anonymous = { kind: 'anonymous' as const };
    await writeDraft('draft', { state: createState('legacy'), updatedAt: 1 }, legacy);
    await writeDraft('draft', { state: createState('promoted'), updatedAt: 1 }, scope);
    await writeDraft('draft', { state: createState('anonymous'), updatedAt: 1 }, anonymous);
    await clearLegacyWorkspaceData(scope);
    expect(await readDraft('draft', legacy)).toBeNull();
    expect(await readDraft('draft', scope)).toBeNull();
    expect((await readDraft('draft', anonymous))?.state.tableName).toBe('anonymous');
  });

  it('rejects the retired workspace list response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ activeWorkspaceId: 'ws-1', workspaces: [] })),
    );

    await expect(fetchCurrentWorkspace()).rejects.toThrow('工作区响应为空');
  });

  it('clears only the selected local workspace partition', async () => {
    const deletion = { onsuccess: null as (() => void) | null };
    const deleteDatabase = vi.fn(() => {
      queueMicrotask(() => deletion.onsuccess?.());
      return deletion;
    });
    Object.defineProperty(indexedDB, 'deleteDatabase', {
      value: deleteDatabase,
      configurable: true,
    });
    const otherScope = { kind: 'user' as const, userId: 'user-1', workspaceId: 'ws-2' };
    await writeDraft('draft-1', { state: createState('local'), updatedAt: 1 }, scope);
    await writeDraft('draft-1', { state: createState('other'), updatedAt: 1 }, otherScope);
    await addSavedTable(
      {
        normalizedName: 'users',
        name: 'users',
        state: createState('users'),
        createdAt: 1,
        updatedAt: 1,
      },
      scope,
    );
    await bulkPutFolders([{ id: 'folder-1', name: 'Folder', order: 1, createdAt: 1 }], scope);

    await clearLocalWorkspaceData(scope);

    expect(deleteDatabase).toHaveBeenCalledWith('ddlbuilder:workspace:ws-1');

    expect(await readDraft('draft-1', scope)).toBeNull();
    expect((await readDraft('draft-1', otherScope))?.state.tableName).toBe('other');
    expect(await listSavedTables(scope)).toEqual([]);
    expect(await listFolders(scope)).toEqual([]);
  });
});
