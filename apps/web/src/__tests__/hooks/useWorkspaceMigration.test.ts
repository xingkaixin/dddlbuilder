import {
  renderHook as testingLibraryRenderHook,
  act,
  cleanup,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import * as Y from 'yjs';
import { upsertSavedTableInYDoc } from '@/services/workspaceYDocAdapter';
import { useWorkspaceMigration } from '@/hooks/useWorkspaceMigration';
import {
  beginLegacyWorkspaceMigration,
  completeLegacyWorkspaceMigration,
  isLegacyWorkspaceMigrationCompleted,
} from '@/services/workspaceLegacyMigrationMarker';
import { addSavedTable, listSavedTables } from '@/utils/savedTablesDb';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import { setupMemoryLocalStorage } from '@/__tests__/utils/memoryLocalStorage';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';

const scope = { kind: 'user' as const, userId: 'user-1', workspaceId: 'ws-1' };
const ydoc = vi.hoisted(() => ({ doc: null as Y.Doc | null }));
vi.mock('@/providers/WorkspaceYDocProvider', () => ({
  useWorkspaceYDoc: () => ({ doc: ydoc.doc, localSynced: true, synced: true }),
}));
const authState = {
  status: 'signed_in' as const,
  userId: scope.userId,
  workspaceId: scope.workspaceId,
};
const anonymous = { kind: 'anonymous' as const };
const state: PersistedState = {
  schemaName: '',
  tableName: 'orders',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [{ id: 'id', fieldName: 'id', fieldType: 'INT', fieldComment: '', nullable: false }],
  indexes: [],
  addCount: 1,
  indexInput: '',
  currentIndexFields: [],
  authInput: '',
  authObjects: [],
};
const table = {
  tableId: 'orders-id',
  name: 'orders',
  normalizedName: 'orders',
  state,
  createdAt: 1,
  updatedAt: 2,
};
const migrationResponse = (status: 'ready' | 'completed') =>
  Response.json({
    status,
    createdCount: 1,
    copiedCount: 0,
    skippedCount: 0,
    conflictCount: 0,
    conflicts: [],
  });

const renderHook = () => {
  const { wrapper } = createQueryClientWrapper();
  return testingLibraryRenderHook(useWorkspaceMigration, { initialProps: authState, wrapper });
};

describe('useWorkspaceMigration', () => {
  beforeEach(async () => {
    ydoc.doc = new Y.Doc();
    setupFakeIndexedDB();
    setupMemoryLocalStorage();
    await addSavedTable(table, anonymous);
    completeLegacyWorkspaceMigration(scope, beginLegacyWorkspaceMigration(scope));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(migrationResponse('ready'))),
    );
  });

  afterEach(() => {
    ydoc.doc?.destroy();
    cleanup();
    teardownFakeIndexedDB();
    vi.unstubAllGlobals();
  });

  it('检查迁移只返回提案，不写入账号分区或重置迁移标记', async () => {
    const { result } = renderHook();
    await waitFor(() => expect(result.current.open).toBe(true));

    expect(result.current.pending?.payload.snapshot.savedTables[0]?.tableId).toBe(table.tableId);
    expect(await listSavedTables(scope)).toEqual([]);
    expect(isLegacyWorkspaceMigrationCompleted(scope)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('稍后处理后重新检查仍不迁移，匿名数据保持原位', async () => {
    const first = renderHook();
    await waitFor(() => expect(first.result.current.open).toBe(true));
    act(() => first.result.current.dismiss());
    expect(first.result.current.open).toBe(false);
    first.unmount();

    const second = renderHook();
    await waitFor(() => expect(second.result.current.checking).toBe(false));
    expect(second.result.current.pending).toBeNull();
    expect(second.result.current.open).toBe(false);
    expect(await listSavedTables(scope)).toEqual([]);
    expect((await listSavedTables(anonymous)).map((item) => item.tableId)).toEqual([table.tableId]);
    expect(isLegacyWorkspaceMigrationCompleted(scope)).toBe(true);
    expect(
      vi.mocked(fetch).mock.calls.map(([, options]) => JSON.parse(String(options?.body)).mode),
    ).toEqual(['analyze', 'analyze']);
  });

  it('当前账号本地已有工作区时不应弹匿名迁移', async () => {
    if (!ydoc.doc) throw new Error('Missing test document');
    upsertSavedTableInYDoc(ydoc.doc, table);
    const { result } = renderHook();
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.open).toBe(false);
    expect(result.current.pending).toBeNull();
  });

  it('workspace 未解析出来之前不应检查迁移', () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = testingLibraryRenderHook(
      () => useWorkspaceMigration({ ...authState, workspaceId: null }),
      { wrapper },
    );
    expect(result.current.checking).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('确认后只提交服务端迁移命令，不另行写入本地快照', async () => {
    const { result } = renderHook();
    await waitFor(() => expect(result.current.open).toBe(true));
    const payload = result.current.pending?.payload;
    vi.mocked(fetch).mockResolvedValueOnce(migrationResponse('completed'));

    await act(async () => {
      await result.current.runMigration();
    });

    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body))).toEqual({
      mode: 'commit',
      payload,
    });
    expect(result.current.pending).toBeNull();
    expect(result.current.open).toBe(false);
    expect(await listSavedTables(scope)).toEqual([]);
    expect(isLegacyWorkspaceMigrationCompleted(scope)).toBe(true);
  });

  it('服务端迁移失败时保留提案供重试，不在本地提前采纳', async () => {
    const { result } = renderHook();
    await waitFor(() => expect(result.current.open).toBe(true));
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: '迁移暂时不可用' }, { status: 503 }),
    );

    await act(async () => {
      await expect(result.current.runMigration()).rejects.toThrow('迁移暂时不可用');
    });
    await waitFor(() => expect(result.current.error).toBe('迁移暂时不可用'));
    expect(result.current.open).toBe(true);
    expect(result.current.pending).not.toBeNull();
    expect(await listSavedTables(scope)).toEqual([]);
    expect(isLegacyWorkspaceMigrationCompleted(scope)).toBe(true);
  });
});
