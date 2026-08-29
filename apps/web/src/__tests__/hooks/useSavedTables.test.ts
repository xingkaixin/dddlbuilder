import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook as testingLibraryRenderHook, act, waitFor } from '@testing-library/react';
import { useSavedTables } from '@/hooks/useSavedTables';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '../utils/fakeIndexedDb';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { flushPromises } from '@/__tests__/utils/test-utils';
import { getSavedTable } from '@/utils/savedTablesDb';
import { listVersions } from '@/utils/tableVersions';
import { listReviews, saveReview } from '@/utils/reviewHistory';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';
import type * as WorkspaceYDocAdapter from '@/services/workspaceYDocAdapter';

const renderHook = <Result, Props>(render: (initialProps: Props) => Result) => {
  const { wrapper } = createQueryClientWrapper();
  return testingLibraryRenderHook(render, { wrapper });
};

const mockUseAuthSession = vi.hoisted(() =>
  vi.fn(() => ({
    status: 'signed_out',
    configured: true,
    userId: null,
    workspaceId: null,
  })),
);
const mockWorkspaceYDoc = vi.hoisted(() => ({
  value: {} as any,
}));
const mockMigrationMarker = vi.hoisted(() => ({
  invalidateLegacyWorkspaceMigration: vi.fn(),
}));
const mockYDocAdapter = vi.hoisted(() => ({
  deleteSavedTableFromYDoc: vi.fn(),
  getSavedTableFromYDoc: vi.fn(),
  listSavedTableMetadataFromYDoc: vi.fn(),
  listSavedTableRecordsFromYDoc: vi.fn(),
  listTrashedSavedTableMetadataFromYDoc: vi.fn(),
  listTrashedSavedTableRecordsFromYDoc: vi.fn(),
  subscribeWorkspaceYDoc: vi.fn(),
  upsertSavedTableInYDoc: vi.fn(),
  renameSavedTableInYDoc: vi.fn(),
}));

vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthSession: mockUseAuthSession,
}));

vi.mock('@/providers/WorkspaceYDocProvider', () => ({
  useWorkspaceYDocDocument: () => mockWorkspaceYDoc.value,
}));

vi.mock('@/services/workspaceLegacyMigrationMarker', () => ({
  invalidateLegacyWorkspaceMigration: mockMigrationMarker.invalidateLegacyWorkspaceMigration,
}));

vi.mock('@/services/workspaceYDocAdapter', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceYDocAdapter>()),
  deleteSavedTableFromYDoc: mockYDocAdapter.deleteSavedTableFromYDoc,
  getSavedTableFromYDoc: mockYDocAdapter.getSavedTableFromYDoc,
  listSavedTableMetadataFromYDoc: mockYDocAdapter.listSavedTableMetadataFromYDoc,
  listSavedTableRecordsFromYDoc: mockYDocAdapter.listSavedTableRecordsFromYDoc,
  listTrashedSavedTableMetadataFromYDoc: mockYDocAdapter.listTrashedSavedTableMetadataFromYDoc,
  listTrashedSavedTableRecordsFromYDoc: mockYDocAdapter.listTrashedSavedTableRecordsFromYDoc,
  subscribeWorkspaceYDoc: mockYDocAdapter.subscribeWorkspaceYDoc,
  upsertSavedTableInYDoc: mockYDocAdapter.upsertSavedTableInYDoc,
  renameSavedTableInYDoc: mockYDocAdapter.renameSavedTableInYDoc,
}));

const createState = (name: string): PersistedState => ({
  schemaName: '',
  tableName: name,
  tableComment: '测试',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 1,
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('useSavedTables', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    mockUseAuthSession.mockReturnValue({
      status: 'signed_out',
      configured: true,
      userId: null,
      workspaceId: null,
    } as any);
    mockWorkspaceYDoc.value = {
      doc: null,
      synced: false,
      localSynced: false,
      connectionState: 'idle',
      retry: vi.fn(),
    };
    mockMigrationMarker.invalidateLegacyWorkspaceMigration.mockReset();
    mockYDocAdapter.deleteSavedTableFromYDoc.mockReset();
    mockYDocAdapter.getSavedTableFromYDoc.mockReset();
    mockYDocAdapter.listSavedTableMetadataFromYDoc.mockReset();
    mockYDocAdapter.listSavedTableRecordsFromYDoc.mockReset().mockReturnValue([]);
    mockYDocAdapter.listTrashedSavedTableMetadataFromYDoc.mockReset().mockReturnValue([]);
    mockYDocAdapter.listTrashedSavedTableRecordsFromYDoc.mockReset().mockReturnValue([]);
    mockYDocAdapter.subscribeWorkspaceYDoc.mockReset().mockReturnValue(vi.fn());
    mockYDocAdapter.upsertSavedTableInYDoc.mockReset();
    mockYDocAdapter.renameSavedTableInYDoc.mockReset();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
  });

  it('should save and prevent duplicate by normalized name', async () => {
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      const saveResult = await result.current.saveTable('Demo', createState('t1'));
      expect(saveResult.ok).toBe(true);
    });

    await act(async () => {
      const duplicate = await result.current.saveTable(' demo ', createState('t2'));
      expect(duplicate).toEqual({ ok: false, reason: 'duplicate' });
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.savedTables).toHaveLength(1);
  });

  it('保存名称不同于 SQL 表名时仍迁移评审历史，并支持立即重命名', async () => {
    const scope = { kind: 'anonymous' } as const;
    const review = await saveReview(
      { scope, normalizedName: 'public.users' },
      'public.users',
      'ddl',
      'mysql',
      { score: 8, summary: 'ok', suggestions: [] },
    );
    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      expect(
        await result.current.saveTable('用户表', { ...createState('users'), schemaName: 'public' }),
      ).toEqual({ ok: true, normalizedName: '用户表', tableId: expect.any(String) });
      expect(await result.current.renameTable('用户表', '用户归档')).toEqual({
        ok: true,
        normalizedName: '用户归档',
        tableId: expect.any(String),
      });
    });
    const record = await result.current.loadTable('用户归档');
    expect(record?.tableId).toBeDefined();
    expect(
      (await listReviews({ scope, tableId: record?.tableId, normalizedName: '用户归档' })).map(
        (entry) => entry.id,
      ),
    ).toEqual([review.id]);
  });

  it('should rename and delete records', async () => {
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      await result.current.saveTable('Alpha', createState('alpha'));
      await flushPromises();
    });

    const current = result.current.savedTables[0];
    expect(current?.name).toBe('Alpha');

    await act(async () => {
      const renameResult = await result.current.renameTable(current.normalizedName, 'Beta');
      expect(renameResult.ok).toBe(true);
      await flushPromises();
    });

    const renamed = result.current.savedTables[0];
    expect(renamed?.name).toBe('Beta');

    await act(async () => {
      const deleteResult = await result.current.deleteTable(renamed.normalizedName);
      expect(deleteResult.ok).toBe(true);
      await flushPromises();
    });

    expect(result.current.savedTables).toHaveLength(0);
  });

  it('永久删除表时应同时删除全部版本和评审历史', async () => {
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      await result.current.saveTable('History', createState('history'));
      await flushPromises();
    });
    const saved = result.current.savedTables[0];
    expect(saved).toBeDefined();
    if (!saved) throw new Error('未创建保存表');

    await act(async () => {
      await result.current.createTableVersion(saved.normalizedName, createState('version-1'));
      await result.current.createTableVersion(saved.normalizedName, createState('version-2'));
      await result.current.deleteTable(saved.normalizedName);
      await flushPromises();
    });

    const target = {
      scope: { kind: 'anonymous' } as const,
      tableId: saved.tableId,
      normalizedName: saved.normalizedName,
    };
    expect(await listVersions(target)).toHaveLength(2);
    await saveReview(target, saved.name, 'ddl', 'mysql', {
      score: 8,
      summary: 'ok',
      suggestions: [],
    });
    expect(await listReviews(target)).toHaveLength(1);

    await act(async () => {
      const deleted = await result.current.deleteTablePermanently(saved.normalizedName);
      expect(deleted).toEqual({
        ok: true,
        normalizedName: saved.normalizedName,
        tableId: saved.tableId,
      });
      await flushPromises();
    });

    expect(await listVersions(target)).toEqual([]);
    const reviews = await listReviews(target);
    expect(reviews).toEqual([]);
    expect(result.current.trashedTables).toEqual([]);
  });

  it('should overwrite existing record', async () => {
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      await result.current.saveTable('Gamma', createState('gamma'));
      await flushPromises();
    });

    const saved = result.current.savedTables[0];
    const load = await result.current.loadTable(saved.normalizedName);
    expect(load?.state.tableName).toBe('gamma');

    await act(async () => {
      const overwriteResult = await result.current.overwriteTable(
        saved.normalizedName,
        createState('gamma-updated'),
      );
      expect(overwriteResult.ok).toBe(true);
      await flushPromises();
    });

    const updated = await result.current.loadTable(saved.normalizedName);
    expect(updated?.state.tableName).toBe('gamma-updated');
  });

  it('should write saved table changes to local ydoc before remote connects', async () => {
    const doc = { transact: (callback: () => void) => callback() };
    mockUseAuthSession.mockReturnValue({
      status: 'signed_in',
      configured: true,
      userId: 'user_1',
      workspaceId: 'workspace_1',
      workspaceScope: { kind: 'user', userId: 'user_1', workspaceId: 'workspace_1' },
    } as any);
    mockWorkspaceYDoc.value = {
      doc,
      synced: false,
      localSynced: true,
      connectionState: 'connecting',
      retry: vi.fn(),
    };
    mockYDocAdapter.getSavedTableFromYDoc.mockReturnValue(null);
    mockYDocAdapter.listSavedTableMetadataFromYDoc.mockReturnValue([]);
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const saveResult = await result.current.saveTable('Pending', createState('pending'));
      expect(saveResult.ok).toBe(true);
      await flushPromises();
    });

    expect(mockYDocAdapter.upsertSavedTableInYDoc).toHaveBeenCalledWith(
      doc,
      expect.objectContaining({ normalizedName: 'pending' }),
    );
    await expect(
      getSavedTable('pending', {
        kind: 'user',
        userId: 'user_1',
        workspaceId: 'workspace_1',
      }),
    ).resolves.toBeNull();
  });

  it('本地 Y.Doc 未就绪时保存，应拒绝写入旧分区', async () => {
    mockUseAuthSession.mockReturnValue({
      status: 'signed_in',
      configured: true,
      userId: 'user_1',
      workspaceId: 'workspace_1',
      workspaceScope: { kind: 'user', userId: 'user_1', workspaceId: 'workspace_1' },
    } as any);
    mockWorkspaceYDoc.value = {
      doc: { transact: (callback: () => void) => callback() },
      synced: false,
      localSynced: false,
      connectionState: 'idle',
      retry: vi.fn(),
    };
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const saveResult = await result.current.saveTable('Shared copy', createState('shared_copy'));
      expect(saveResult).toMatchObject({ ok: false, reason: 'error' });
      await flushPromises();
    });

    expect(mockYDocAdapter.upsertSavedTableInYDoc).not.toHaveBeenCalled();
    await expect(
      getSavedTable('shared copy', {
        kind: 'user',
        userId: 'user_1',
        workspaceId: 'workspace_1',
      }),
    ).resolves.toBeNull();
  });

  it('本地 Y.Doc 未就绪时批量导入，应明确报告未写入', async () => {
    mockUseAuthSession.mockReturnValue({
      status: 'signed_in',
      configured: true,
      userId: 'user_1',
      workspaceId: 'workspace_1',
      workspaceScope: { kind: 'user', userId: 'user_1', workspaceId: 'workspace_1' },
    } as any);
    mockWorkspaceYDoc.value = {
      doc: { transact: (callback: () => void) => callback() },
      synced: false,
      localSynced: false,
      connectionState: 'idle',
      retry: vi.fn(),
    };
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      await flushPromises();
      const imported = await result.current.importTables({
        items: [{ name: 'Imported', state: createState('imported') }],
        conflictStrategy: 'skip',
      });
      expect(imported).toEqual({ successCount: 0, skipCount: 0, failCount: 1 });
      await flushPromises();
    });

    await expect(
      getSavedTable('imported', {
        kind: 'user',
        userId: 'user_1',
        workspaceId: 'workspace_1',
      }),
    ).resolves.toBeNull();
  });

  it('本地 Y.Doc 就绪时保存，不应重开 legacy 迁移', async () => {
    mockUseAuthSession.mockReturnValue({
      status: 'signed_in',
      configured: true,
      userId: 'user_1',
      workspaceId: 'workspace_1',
      workspaceScope: { kind: 'user', userId: 'user_1', workspaceId: 'workspace_1' },
    } as any);
    mockWorkspaceYDoc.value = {
      doc: { transact: (callback: () => void) => callback() },
      synced: false,
      localSynced: true,
      connectionState: 'connecting',
      retry: vi.fn(),
    };
    mockYDocAdapter.getSavedTableFromYDoc.mockReturnValue(null);
    mockYDocAdapter.listSavedTableMetadataFromYDoc.mockReturnValue([]);
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      await result.current.saveTable('Normal', createState('normal'));
      await flushPromises();
    });

    expect(mockYDocAdapter.upsertSavedTableInYDoc).toHaveBeenCalled();
    expect(mockMigrationMarker.invalidateLegacyWorkspaceMigration).not.toHaveBeenCalled();
  });

  it('records the current trash write target when Y.Doc is ready', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const doc = { transact: (callback: () => void) => callback() };
    mockUseAuthSession.mockReturnValue({
      status: 'signed_in',
      configured: true,
      userId: 'user_1',
      workspaceId: 'workspace_1',
      workspaceScope: { kind: 'user', userId: 'user_1', workspaceId: 'workspace_1' },
    } as any);
    mockWorkspaceYDoc.value = {
      doc,
      synced: true,
      localSynced: true,
      connectionState: 'connected',
      retry: vi.fn(),
    };
    mockYDocAdapter.listSavedTableMetadataFromYDoc.mockReturnValue([]);
    mockYDocAdapter.getSavedTableFromYDoc.mockReturnValue({
      normalizedName: 'orders',
      name: 'Orders',
      state: createState('orders'),
      createdAt: 1,
      updatedAt: 1,
    });
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      await result.current.deleteTable('orders');
      await flushPromises();
    });

    expect(mockYDocAdapter.upsertSavedTableInYDoc).toHaveBeenCalledWith(
      doc,
      expect.objectContaining({ normalizedName: 'orders', trashedAt: expect.any(Number) }),
    );
    expect(mockYDocAdapter.deleteSavedTableFromYDoc).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"target":"ydoc"'));
    log.mockRestore();
  });

  it('should keep saved table order stable after overwrite', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(100);
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      await result.current.saveTable('Alpha', createState('alpha'));
      clock.mockReturnValue(200);
      await result.current.saveTable('Beta', createState('beta'));
      await flushPromises();
    });

    expect(result.current.savedTables.map((table) => table.name)).toEqual(['Beta', 'Alpha']);

    await act(async () => {
      const alpha = result.current.savedTables.find((table) => table.name === 'Alpha');
      expect(alpha).toBeDefined();
      if (!alpha) return;
      clock.mockReturnValue(300);
      await result.current.overwriteTable(alpha.normalizedName, createState('alpha-updated'));
      await flushPromises();
    });

    expect(result.current.savedTables.map((table) => table.name)).toEqual(['Beta', 'Alpha']);
  });

  it('should refresh ydoc updates without showing loading again', async () => {
    let notifyYDocChanged: (() => void) | null = null;
    const doc = {};
    mockUseAuthSession.mockReturnValue({
      status: 'signed_in',
      configured: true,
      userId: 'user_1',
      workspaceId: 'workspace_1',
      workspaceScope: { kind: 'user', userId: 'user_1', workspaceId: 'workspace_1' },
    } as any);
    mockWorkspaceYDoc.value = {
      doc,
      synced: true,
      localSynced: true,
      connectionState: 'connected',
      retry: vi.fn(),
    };
    mockYDocAdapter.subscribeWorkspaceYDoc.mockImplementation((_doc, notify) => {
      notifyYDocChanged = notify;
      return vi.fn();
    });
    mockYDocAdapter.listSavedTableMetadataFromYDoc
      .mockReturnValueOnce([
        {
          normalizedName: 'alpha',
          name: 'Alpha',
          dbType: 'mysql',
          fieldCount: 1,
          createdAt: 100,
          updatedAt: 100,
        },
      ])
      .mockReturnValueOnce([
        {
          normalizedName: 'beta',
          name: 'Beta',
          dbType: 'mysql',
          fieldCount: 2,
          createdAt: 200,
          updatedAt: 200,
        },
      ]);

    const { result } = renderHook(() => useSavedTables());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.savedTables.map((table) => table.name)).toEqual(['Alpha']);
    });

    act(() => {
      notifyYDocChanged?.();
    });

    expect(result.current.loading).toBe(false);

    await waitFor(() => {
      expect(result.current.savedTables.map((table) => table.name)).toEqual(['Beta']);
    });

    expect(result.current.loading).toBe(false);
  });

  it('restores a trashed record from the authoritative YDoc', async () => {
    const doc = { transact: (callback: () => void) => callback() };
    mockUseAuthSession.mockReturnValue({
      status: 'signed_in',
      configured: true,
      userId: 'user_1',
      workspaceId: 'workspace_1',
      workspaceScope: { kind: 'user', userId: 'user_1', workspaceId: 'workspace_1' },
    } as any);
    mockWorkspaceYDoc.value = {
      doc,
      synced: true,
      localSynced: true,
      connectionState: 'connected',
      retry: vi.fn(),
    };
    mockYDocAdapter.listSavedTableMetadataFromYDoc.mockReturnValue([]);
    mockYDocAdapter.getSavedTableFromYDoc.mockReturnValue({
      normalizedName: 'archived',
      name: 'Archived',
      state: createState('archived'),
      folderId: 'folder-1',
      trashedAt: 200,
      createdAt: 100,
      updatedAt: 200,
    });
    const { result } = renderHook(() => useSavedTables());
    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const restored = await result.current.restoreTable('archived', {
        existingFolderIds: new Set(['folder-1']),
      });
      expect(restored).toEqual({
        ok: true,
        normalizedName: 'archived',
        tableId: 'legacy:archived',
      });
      await flushPromises();
    });

    expect(mockYDocAdapter.renameSavedTableInYDoc).toHaveBeenCalledWith(
      doc,
      'archived',
      expect.objectContaining({
        normalizedName: 'archived',
        folderId: 'folder-1',
        trashedAt: undefined,
      }),
    );
  });
});
