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

const mockUseAuthIdentity = vi.hoisted(() =>
  vi.fn(() => ({
    status: 'signed_out',
    configured: true,
    userId: null,
    workspaceId: null,
  })),
);
const mockWorkspaceYDoc = vi.hoisted(() => ({
  // SAFETY: The provider mock is populated with the fields consumed by useSavedTables in each test.
  value: {} as any,
}));
const mockYDocAdapter = vi.hoisted(() => ({
  deleteSavedTableFromYDoc: vi.fn(),
  getSavedTableFromYDoc: vi.fn(),
  listSavedTableMetadataFromYDoc: vi.fn(),
  listSavedTableRecordsFromYDoc: vi.fn(),
  listTrashedSavedTableMetadataFromYDoc: vi.fn(),
  listTrashedSavedTableRecordsFromYDoc: vi.fn(),
  recreateSavedTableInYDoc: vi.fn(),
  subscribeWorkspaceYDoc: vi.fn(),
  upsertSavedTableInYDoc: vi.fn(),
  updateSavedTableMetadataInYDoc: vi.fn(),
  renameSavedTableInYDoc: vi.fn(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Control authentication transitions while testing the saved-table hook.
vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthIdentity: mockUseAuthIdentity,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Supply deterministic Y.Doc readiness states for persistence behavior tests.
vi.mock('@/providers/WorkspaceYDocProvider', () => ({
  useWorkspaceYDocDocument: () => mockWorkspaceYDoc.value,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Preserve adapter logic while replacing only Y.Doc I/O seams with controllable spies.
vi.mock('@/services/workspaceYDocAdapter', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceYDocAdapter>()),
  deleteSavedTableFromYDoc: mockYDocAdapter.deleteSavedTableFromYDoc,
  getSavedTableFromYDoc: mockYDocAdapter.getSavedTableFromYDoc,
  listSavedTableMetadataFromYDoc: mockYDocAdapter.listSavedTableMetadataFromYDoc,
  listSavedTableRecordsFromYDoc: mockYDocAdapter.listSavedTableRecordsFromYDoc,
  listTrashedSavedTableMetadataFromYDoc: mockYDocAdapter.listTrashedSavedTableMetadataFromYDoc,
  listTrashedSavedTableRecordsFromYDoc: mockYDocAdapter.listTrashedSavedTableRecordsFromYDoc,
  recreateSavedTableInYDoc: mockYDocAdapter.recreateSavedTableInYDoc,
  subscribeWorkspaceYDoc: mockYDocAdapter.subscribeWorkspaceYDoc,
  upsertSavedTableInYDoc: mockYDocAdapter.upsertSavedTableInYDoc,
  updateSavedTableMetadataInYDoc: mockYDocAdapter.updateSavedTableMetadataInYDoc,
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
    // SAFETY: The auth provider mock supplies only the identity fields consumed by this hook.
    mockUseAuthIdentity.mockReturnValue({
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
    mockYDocAdapter.deleteSavedTableFromYDoc.mockReset();
    mockYDocAdapter.getSavedTableFromYDoc.mockReset();
    mockYDocAdapter.listSavedTableMetadataFromYDoc.mockReset();
    mockYDocAdapter.listSavedTableRecordsFromYDoc.mockReset().mockReturnValue([]);
    mockYDocAdapter.listTrashedSavedTableMetadataFromYDoc.mockReset().mockReturnValue([]);
    mockYDocAdapter.listTrashedSavedTableRecordsFromYDoc.mockReset().mockReturnValue([]);
    mockYDocAdapter.recreateSavedTableInYDoc.mockReset();
    mockYDocAdapter.subscribeWorkspaceYDoc.mockReset().mockReturnValue(vi.fn());
    mockYDocAdapter.upsertSavedTableInYDoc.mockReset();
    mockYDocAdapter.updateSavedTableMetadataInYDoc.mockReset();
    mockYDocAdapter.renameSavedTableInYDoc.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    const draftId = 'public-users-draft';

    const review = await saveReview(
      { scope, draftId, normalizedName: 'public.users' },
      'public.users',
      'ddl',
      'mysql',
      { score: 8, summary: 'ok', suggestions: [] },
    );

    if (!review) throw new Error('Expected review to be persisted');
    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      expect(
        await result.current.saveTable(
          '用户表',
          { ...createState('users'), schemaName: 'public' },
          draftId,
        ),
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

  it('本地 Y.Doc 未就绪时保存，应拒绝写入旧分区', async () => {
    // SAFETY: The auth provider mock supplies only the identity fields consumed by this hook.
    mockUseAuthIdentity.mockReturnValue({
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
});
