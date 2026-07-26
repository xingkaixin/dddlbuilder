import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSavedTables } from '@/hooks/useSavedTables';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '../utils/fakeIndexedDb';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { flushPromises } from '@/__tests__/utils/test-utils';
import { listWorkspaceOutboxItems } from '@/utils/workspaceSyncStateDb';
import { addSavedTable, moveSavedTableToTrash } from '@/utils/savedTablesDb';

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
const mockYDocAdapter = vi.hoisted(() => ({
  deleteSavedTableFromYDoc: vi.fn(),
  getSavedTableFromYDoc: vi.fn(),
  listSavedTableMetadataFromYDoc: vi.fn(),
  subscribeWorkspaceYDoc: vi.fn(),
  upsertSavedTableInYDoc: vi.fn(),
}));

vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthSession: mockUseAuthSession,
}));

vi.mock('@/providers/WorkspaceYDocProvider', () => ({
  useWorkspaceYDoc: () => mockWorkspaceYDoc.value,
}));

vi.mock('@/services/workspaceYDocAdapter', () => ({
  deleteSavedTableFromYDoc: mockYDocAdapter.deleteSavedTableFromYDoc,
  getSavedTableFromYDoc: mockYDocAdapter.getSavedTableFromYDoc,
  listSavedTableMetadataFromYDoc: mockYDocAdapter.listSavedTableMetadataFromYDoc,
  subscribeWorkspaceYDoc: mockYDocAdapter.subscribeWorkspaceYDoc,
  upsertSavedTableInYDoc: mockYDocAdapter.upsertSavedTableInYDoc,
}));

const createState = (name: string): PersistedState => ({
  schemaName: '',
  tableName: name,
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
    mockYDocAdapter.deleteSavedTableFromYDoc.mockReset();
    mockYDocAdapter.getSavedTableFromYDoc.mockReset();
    mockYDocAdapter.listSavedTableMetadataFromYDoc.mockReset();
    mockYDocAdapter.subscribeWorkspaceYDoc.mockReset();
    mockYDocAdapter.upsertSavedTableInYDoc.mockReset();
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
    expect(await listWorkspaceOutboxItems('workspace_1')).toHaveLength(0);
  });

  it('should keep saved table order stable after overwrite', async () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(300);
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      await result.current.saveTable('Alpha', createState('alpha'));
      await result.current.saveTable('Beta', createState('beta'));
      await flushPromises();
    });

    expect(result.current.savedTables.map((table) => table.name)).toEqual(['Beta', 'Alpha']);

    await act(async () => {
      const alpha = result.current.savedTables.find((table) => table.name === 'Alpha');
      expect(alpha).toBeDefined();
      if (!alpha) return;
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

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.savedTables.map((table) => table.name)).toEqual(['Alpha']);

    act(() => {
      notifyYDocChanged?.();
    });

    expect(result.current.loading).toBe(false);

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.savedTables.map((table) => table.name)).toEqual(['Beta']);
  });

  it('restores trashed local data when the authoritative YDoc no longer contains it', async () => {
    const scope = {
      kind: 'user' as const,
      userId: 'user_1',
      workspaceId: 'workspace_1',
    };
    await addSavedTable(
      {
        normalizedName: 'archived',
        name: 'Archived',
        state: createState('archived'),
        folderId: 'folder-1',
        createdAt: 100,
        updatedAt: 100,
      },
      scope,
    );
    await moveSavedTableToTrash('archived', scope);
    const doc = { transact: (callback: () => void) => callback() };
    mockUseAuthSession.mockReturnValue({
      status: 'signed_in',
      configured: true,
      userId: 'user_1',
      workspaceId: 'workspace_1',
    } as any);
    mockWorkspaceYDoc.value = {
      doc,
      synced: true,
      localSynced: true,
      connectionState: 'connected',
      retry: vi.fn(),
    };
    mockYDocAdapter.listSavedTableMetadataFromYDoc.mockReturnValue([]);
    mockYDocAdapter.getSavedTableFromYDoc.mockReturnValue(null);
    const { result } = renderHook(() => useSavedTables());
    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const restored = await result.current.restoreTable('archived', {
        existingFolderIds: new Set(['folder-1']),
      });
      expect(restored).toEqual({ ok: true, normalizedName: 'archived' });
      await flushPromises();
    });

    expect(mockYDocAdapter.upsertSavedTableInYDoc).toHaveBeenCalledWith(
      doc,
      expect.objectContaining({
        normalizedName: 'archived',
        folderId: 'folder-1',
        trashedAt: undefined,
      }),
    );
  });
});
