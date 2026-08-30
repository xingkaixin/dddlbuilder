import {
  markWorkspaceCleanupPending,
  readWorkspaceCaches,
  rememberWorkspaceCache,
} from '@/services/workspaceCacheRegistry';
import { writeWorkspaceIdentity, readWorkspaceIdentity } from '@/services/workspaceIdentity';
import { setupMemoryLocalStorage } from '@/__tests__/utils/memoryLocalStorage';
import * as Y from 'yjs';
import { watchWorkspaceHistory } from '@/services/workspaceHistoryCleanup';
import {
  upsertSavedTableInYDoc,
  recreateSavedTableInYDoc,
  deleteSavedTableFromYDoc,
  getSavedTableFromYDoc,
} from '@/services/workspaceYDocAdapter';
import { createVersion, listVersions } from '@/utils/tableVersions';
import { saveReview, listReviews } from '@/utils/reviewHistory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import {
  clearLegacyWorkspaceData,
  clearLocalWorkspaceData,
  retryPendingWorkspaceCleanup,
  fetchCurrentWorkspace,
} from '@/services/workspaceAccountService';
import { addSavedTable, listSavedTables, updateSavedTable } from '@/utils/savedTablesDb';
import {
  beginWorkspaceEntityDeletion,
  WORKSPACE_ENTITY_DELETION_LEASE_MS,
} from '@/utils/workspaceEntityDeletion';
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
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('workspaceAccountService', () => {
  it('removes every registered workspace for an account without touching another account', async () => {
    const older = { ...scope, workspaceId: 'older' };
    const other = { ...scope, userId: 'other', workspaceId: 'other' };
    for (const current of [scope, older, other]) {
      rememberWorkspaceCache(current);
      await writeDraft('draft', { state: createState(current.workspaceId), updatedAt: 1 }, current);
    }
    const deleted = vi.spyOn(indexedDB, 'deleteDatabase');
    await clearLocalWorkspaceData(scope);
    expect(deleted.mock.calls.map(([name]) => name).sort()).toEqual([
      'ddlbuilder:workspace:older',
      'ddlbuilder:workspace:ws-1',
    ]);
    expect(await readDraft('draft', older)).toBeNull();
    expect((await readDraft('draft', other))?.state.tableName).toBe('other');
    expect(readWorkspaceCaches()).toEqual([{ ...other, status: 'active' }]);
  });

  it('retries durable cleanup after a blocked database deletion', async () => {
    writeWorkspaceIdentity(scope);
    markWorkspaceCleanupPending(scope);
    const blocked = vi.spyOn(indexedDB, 'deleteDatabase').mockImplementationOnce(() => {
      const request = { onblocked: null as (() => void) | null };
      queueMicrotask(() => request.onblocked?.());
      return request as unknown as IDBOpenDBRequest;
    });
    await expect(clearLocalWorkspaceData(scope)).rejects.toThrow('Close other workspace tabs');
    expect(readWorkspaceCaches()).toEqual([{ ...scope, status: 'pending_cleanup' }]);
    blocked.mockRestore();
    await retryPendingWorkspaceCleanup();
    expect(readWorkspaceCaches()).toEqual([]);
    expect(readWorkspaceIdentity()).toBeNull();
  });

  it('远端永久删除清理历史，旧副本重现实体也不自动清 deleted marker', async () => {
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
    expect(await createVersion(deleted, createState('late-version'))).toBeNull();
    expect(
      await saveReview(deleted, 'deleted', 'late-ddl', 'mysql', {
        score: 8,
        summary: 'late',
        suggestions: [],
      }),
    ).toBeNull();

    upsertSavedTableInYDoc(doc, {
      tableId: deleted.tableId,
      normalizedName: deleted.normalizedName,
      name: deleted.normalizedName,
      state: createState(deleted.normalizedName),
      createdAt: 1,
      updatedAt: 3,
    });
    await vi.waitFor(async () =>
      expect(await createVersion(deleted, createState('still-blocked'))).toBeNull(),
    );
    stop();
    doc.destroy();
    remote.destroy();
  });

  it('并发重新激活不会被巡检重删，lease 后保留历史并恢复写入', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(1_000);
    const doc = new Y.Doc();
    const stale = new Y.Doc();
    const target = { scope, tableId: 'crashed-delete', normalizedName: 'crashed-delete' };
    const record = {
      tableId: target.tableId,
      normalizedName: target.normalizedName,
      name: target.normalizedName,
      state: createState(target.normalizedName),
      createdAt: 1,
      updatedAt: 1,
    };
    upsertSavedTableInYDoc(doc, record);
    Y.applyUpdate(stale, Y.encodeStateAsUpdate(doc));
    await addSavedTable(record, scope);
    await createVersion(target, createState('before-delete'));
    await beginWorkspaceEntityDeletion(target, () => deleteSavedTableFromYDoc(doc, target));
    recreateSavedTableInYDoc(stale, {
      ...record,
      state: { ...record.state, tableComment: 'restored' },
      updatedAt: 2,
    });
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(stale));
    const stop = watchWorkspaceHistory(doc, scope);

    try {
      expect(getSavedTableFromYDoc(doc, target)?.state.tableComment).toBe('restored');
      expect(await createVersion(target, createState('blocked'))).toBeNull();

      await vi.advanceTimersByTimeAsync(WORKSPACE_ENTITY_DELETION_LEASE_MS);

      expect(getSavedTableFromYDoc(doc, target)?.state.tableComment).toBe('restored');
      await vi.waitFor(async () => expect(await listVersions(target)).toHaveLength(1));
      await vi.waitFor(async () =>
        expect(updateSavedTable({ ...record, updatedAt: 3 }, scope)).resolves.toBeUndefined(),
      );
    } finally {
      stop();
      doc.destroy();
      stale.destroy();
      vi.useRealTimers();
    }
  });

  it('启动历史巡检保留未保存文档的 name-key 评审', async () => {
    const doc = new Y.Doc();
    const draftTarget = { scope, normalizedName: 'draft-only' };
    const review = await saveReview(draftTarget, 'draft-only', 'ddl', 'mysql', {
      score: 8,
      summary: 'draft',
      suggestions: [],
    });
    if (!review) throw new Error('Expected draft review to be persisted');

    const stop = watchWorkspaceHistory(doc, scope);

    await vi.waitFor(async () =>
      expect((await listReviews(draftTarget)).map((item) => item.id)).toEqual([review.id]),
    );
    stop();
    doc.destroy();
  });

  it('离线远端删除后启动巡检清 stable 历史并保留 legacy name 评审', async () => {
    const doc = new Y.Doc();
    const target = { scope, tableId: 'offline-deleted', normalizedName: 'users' };
    const draftTarget = { scope, normalizedName: target.normalizedName };
    await createVersion(target, createState('users'));
    await saveReview(draftTarget, 'users', 'old-ddl', 'mysql', {
      score: 8,
      summary: 'old',
      suggestions: [],
    });

    const stop = watchWorkspaceHistory(doc, scope);

    try {
      await vi.waitFor(async () => expect(await listVersions(target)).toEqual([]));
      await vi.waitFor(async () => expect(await listReviews(draftTarget)).toHaveLength(1));
    } finally {
      stop();
      doc.destroy();
    }
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
    setupMemoryLocalStorage();
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
    await bulkPutFolders(
      [{ id: 'folder-1', name: 'Folder', order: 1, createdAt: 1, updatedAt: 1 }],
      scope,
    );

    await clearLocalWorkspaceData(scope);

    expect(deleteDatabase).toHaveBeenCalledWith('ddlbuilder:workspace:ws-1');

    expect(await readDraft('draft-1', scope)).toBeNull();
    expect((await readDraft('draft-1', otherScope))?.state.tableName).toBe('other');
    expect(await listSavedTables(scope)).toEqual([]);
    expect(await listFolders(scope)).toEqual([]);
  });
});
