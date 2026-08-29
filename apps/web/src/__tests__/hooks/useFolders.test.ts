import { useWorkspaceQuerySync } from '@/hooks/workspacePersistence/useWorkspaceQuerySync';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook as testingLibraryRenderHook, act, waitFor } from '@testing-library/react';
import { useFolders } from '@/hooks/useFolders';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import { flushPromises } from '@/__tests__/utils/test-utils';
import * as tableFolders from '@/utils/tableFolders';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';

const renderHook = <Result, Props>(render: (initialProps: Props) => Result) => {
  const { wrapper } = createQueryClientWrapper();
  return testingLibraryRenderHook(render, { wrapper });
};

vi.mock('@/utils/tableFolders', () => ({
  __esModule: true,
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
  moveFolder: vi.fn(),
  buildFolderTree: vi.fn(),
  getDescendantFolderIds: vi.fn(),
  getFolder: vi.fn(),
  updateFolder: vi.fn(),
}));

vi.mock('@/auth/AuthSessionProvider', () => {
  const useAuthSession = () => ({
    status: 'signed_out',
    userId: null,
    workspaceId: null,
  });
  return { useAuthSession, useAuthIdentity: useAuthSession };
});

describe('useFolders', () => {
  const mockListFolders = vi.mocked(tableFolders.listFolders);
  const mockCreateFolder = vi.mocked(tableFolders.createFolder);
  const mockRenameFolder = vi.mocked(tableFolders.renameFolder);
  const mockDeleteFolder = vi.mocked(tableFolders.deleteFolder);
  const mockMoveFolder = vi.mocked(tableFolders.moveFolder);
  const mockBuildFolderTree = vi.mocked(tableFolders.buildFolderTree);
  const mockGetFolder = vi.mocked(tableFolders.getFolder);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not install a snapshot listener for every authority consumer', () => {
    const listen = vi.spyOn(window, 'addEventListener');
    renderHook(() => {
      useFolders();
      useFolders();
      useFolders();
    });
    const count = listen.mock.calls.filter(
      ([event]) => event === WORKSPACE_SNAPSHOT_APPLIED_EVENT,
    ).length;
    expect(count).toBe(0);
  });

  it('should load folders on mount', async () => {
    mockListFolders.mockResolvedValue([{ id: '1', name: 'Root', order: 1 } as any]);
    mockBuildFolderTree.mockResolvedValue([
      { id: '1', name: 'Root', order: 1, children: [] } as any,
    ]);

    const { result } = renderHook(() => useFolders());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.folders).toHaveLength(1);
    expect(result.current.folderTree).toHaveLength(1);
  });

  it('should reload folders when a workspace snapshot is applied', async () => {
    mockListFolders
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: '1', name: 'Root', order: 1 } as any]);
    mockBuildFolderTree
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: '1', name: 'Root', order: 1, children: [] } as any]);

    const { result } = renderHook(() => {
      useWorkspaceQuerySync();
      return useFolders();
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.folders).toHaveLength(0);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(WORKSPACE_SNAPSHOT_APPLIED_EVENT));
    });

    await waitFor(() => expect(result.current.folders).toHaveLength(1));
  });

  it('should handle load error', async () => {
    mockListFolders.mockRejectedValue(new Error('load error'));
    mockBuildFolderTree.mockResolvedValue([]);

    const { result } = renderHook(() => useFolders());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('load error');
  });

  it('should fallback to default message when load fails with non-error', async () => {
    mockListFolders.mockRejectedValue('boom');
    mockBuildFolderTree.mockResolvedValue([]);

    const { result } = renderHook(() => useFolders());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('加载文件夹失败');
  });

  it('should create folder and refresh list', async () => {
    mockListFolders
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: '2', name: 'New', order: 1 } as any]);
    mockBuildFolderTree
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: '2', name: 'New', order: 1, children: [] } as any]);
    mockCreateFolder.mockResolvedValue({
      id: '2',
      name: 'New',
      order: 1,
    } as any);

    const { result } = renderHook(() => useFolders());

    await act(async () => {
      await flushPromises();
    });

    let created: { id: string } | undefined;
    await act(async () => {
      created = await result.current.createFolder('New');
      await flushPromises();
    });
    expect(created?.id).toBe('2');
  });

  it('should delete folder and return affected ids', async () => {
    mockListFolders
      .mockResolvedValueOnce([{ id: '1', name: 'Root', order: 1 } as any])
      .mockResolvedValueOnce([]);
    mockBuildFolderTree
      .mockResolvedValueOnce([{ id: '1', name: 'Root', order: 1, children: [] } as any])
      .mockResolvedValueOnce([]);
    mockDeleteFolder.mockResolvedValue(['1', 'child']);

    const { result } = renderHook(() => useFolders());

    await act(async () => {
      await flushPromises();
    });

    let affected: string[] | undefined;
    await act(async () => {
      affected = await result.current.deleteFolder('1');
      await flushPromises();
    });
    expect(affected).toEqual(['1', 'child']);
  });

  it('should throw when rename or move fails', async () => {
    mockListFolders.mockResolvedValue([]);
    mockBuildFolderTree.mockResolvedValue([]);
    mockRenameFolder.mockRejectedValue(new Error('rename failed'));
    mockMoveFolder.mockRejectedValue(new Error('move failed'));

    const { result } = renderHook(() => useFolders());

    await act(async () => {
      await flushPromises();
    });

    await expect(result.current.renameFolder('1', 'x')).rejects.toThrow('rename failed');
    await expect(result.current.moveFolder('1', '2')).rejects.toThrow('move failed');
  });

  it('should rename and move folder successfully', async () => {
    mockListFolders
      .mockResolvedValueOnce([{ id: '1', name: 'Root', order: 1 } as any])
      .mockResolvedValueOnce([{ id: '1', name: 'Renamed', order: 1 } as any])
      .mockResolvedValueOnce([{ id: '1', name: 'Renamed', order: 1 } as any]);
    mockBuildFolderTree
      .mockResolvedValueOnce([{ id: '1', name: 'Root', order: 1, children: [] } as any])
      .mockResolvedValueOnce([{ id: '1', name: 'Renamed', order: 1, children: [] } as any])
      .mockResolvedValueOnce([{ id: '1', name: 'Renamed', order: 1, children: [] } as any]);
    mockRenameFolder.mockResolvedValue(undefined);
    mockMoveFolder.mockResolvedValue(undefined);
    mockGetFolder.mockResolvedValue({ id: '1', name: 'Renamed', order: 1 } as any);

    const { result } = renderHook(() => useFolders());

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      await result.current.renameFolder('1', 'Renamed');
      await flushPromises();
    });
    await act(async () => {
      await result.current.moveFolder('1');
      await flushPromises();
    });

    expect(mockRenameFolder).toHaveBeenCalledWith('1', 'Renamed', { kind: 'anonymous' });
    expect(mockMoveFolder).toHaveBeenCalledWith('1', { kind: 'anonymous' }, undefined);
  });

  it('should throw default messages when operations fail with non-error', async () => {
    mockListFolders.mockResolvedValue([]);
    mockBuildFolderTree.mockResolvedValue([]);
    mockCreateFolder.mockRejectedValue('fail');
    mockRenameFolder.mockRejectedValue('fail');
    mockDeleteFolder.mockRejectedValue('fail');
    mockMoveFolder.mockRejectedValue('fail');

    const { result } = renderHook(() => useFolders());

    await act(async () => {
      await flushPromises();
    });

    await expect(result.current.createFolder('x')).rejects.toThrow('创建文件夹失败');
    await expect(result.current.renameFolder('1', 'x')).rejects.toThrow('重命名文件夹失败');
    await expect(result.current.deleteFolder('1')).rejects.toThrow('删除失败');
    await expect(result.current.moveFolder('1', '2')).rejects.toThrow('文件夹移动失败');
  });

  it('should keep original error message when create/delete fail with Error', async () => {
    mockListFolders.mockResolvedValue([]);
    mockBuildFolderTree.mockResolvedValue([]);
    mockCreateFolder.mockRejectedValue(new Error('create err'));
    mockDeleteFolder.mockRejectedValue(new Error('delete err'));

    const { result } = renderHook(() => useFolders());

    await act(async () => {
      await flushPromises();
    });

    await expect(result.current.createFolder('x')).rejects.toThrow('create err');
    await expect(result.current.deleteFolder('1')).rejects.toThrow('delete err');
  });
});
