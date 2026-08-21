import { renderHook as testingLibraryRenderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceMigration } from '@/hooks/useWorkspaceMigration';
import { invalidateLegacyWorkspaceMigration } from '@/services/workspaceLegacyMigrationMarker';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';

const renderHook = <Result, Props>(render: (initialProps: Props) => Result) => {
  const { wrapper } = createQueryClientWrapper();
  return testingLibraryRenderHook(render, { wrapper });
};

vi.mock('@/services/workspaceLegacyMigrationMarker', () => ({
  invalidateLegacyWorkspaceMigration: vi.fn(),
}));

vi.mock('@/services/workspaceMigrationService', () => ({
  analyzeWorkspaceMigration: vi.fn(),
  applyWorkspaceMigrationPayloadToLocal: vi.fn(),
  commitWorkspaceMigration: vi.fn(),
  clearWorkspaceMigrationDismissed: vi.fn(),
  dismissWorkspaceMigration: vi.fn(),
  hasMeaningfulWorkspaceData: vi.fn(),
  isWorkspaceMigrationDismissed: vi.fn(() => false),
}));

describe('useWorkspaceMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('当前账号本地已有工作区时不应弹匿名迁移', async () => {
    const { analyzeWorkspaceMigration, hasMeaningfulWorkspaceData } =
      await import('@/services/workspaceMigrationService');

    vi.mocked(analyzeWorkspaceMigration).mockResolvedValue({
      payload: {
        localFingerprint: 'fingerprint',
        idempotencyKey: 'idempotency',
        snapshot: {
          globalDraft: {
            state: { rows: [{ fieldName: 'id' }] },
            updatedAt: 1,
          },
          activeSession: null,
          savedTables: [],
          savedDrafts: [],
        },
      },
      result: {
        status: 'ready',
        createdCount: 1,
        copiedCount: 0,
        skippedCount: 0,
        conflictCount: 0,
        conflicts: [],
      },
    } as any);
    vi.mocked(hasMeaningfulWorkspaceData).mockResolvedValue(true);

    const { result } = renderHook(() =>
      useWorkspaceMigration({
        status: 'signed_in',
        userId: 'user-1',
        workspaceId: 'ws-1',
      }),
    );

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.open).toBe(false);
    expect(result.current.pending).toBeNull();
  });

  it('检测到匿名工作区时应先应用到当前用户本地作用域', async () => {
    const {
      analyzeWorkspaceMigration,
      applyWorkspaceMigrationPayloadToLocal,
      hasMeaningfulWorkspaceData,
    } = await import('@/services/workspaceMigrationService');

    const payload = {
      localFingerprint: 'fingerprint',
      idempotencyKey: 'idempotency',
      snapshot: {
        globalDraft: {
          state: { rows: [{ fieldName: 'id' }] },
          updatedAt: 1,
        },
        activeSession: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      },
    };

    vi.mocked(analyzeWorkspaceMigration).mockResolvedValue({
      payload,
      result: {
        status: 'ready',
        createdCount: 1,
        copiedCount: 0,
        skippedCount: 0,
        conflictCount: 0,
        conflicts: [],
      },
    } as any);
    vi.mocked(hasMeaningfulWorkspaceData).mockResolvedValue(false);
    vi.mocked(applyWorkspaceMigrationPayloadToLocal).mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useWorkspaceMigration({
        status: 'signed_in',
        userId: 'user-1',
        workspaceId: 'ws-1',
      }),
    );

    await waitFor(() => {
      expect(result.current.open).toBe(true);
    });

    expect(applyWorkspaceMigrationPayloadToLocal).toHaveBeenCalledWith(payload, {
      kind: 'user',
      userId: 'user-1',
    });
    // 写进 legacy 分区的数据只能靠启动迁移进 Y.Doc，必须让它重跑一次。
    expect(invalidateLegacyWorkspaceMigration).toHaveBeenCalledWith({
      kind: 'user',
      userId: 'user-1',
      workspaceId: 'ws-1',
    });
  });

  it('workspace 未解析出来之前不应采纳匿名工作区', async () => {
    const { analyzeWorkspaceMigration } = await import('@/services/workspaceMigrationService');

    const { result } = renderHook(() =>
      useWorkspaceMigration({
        status: 'signed_in',
        userId: 'user-1',
        workspaceId: null,
      }),
    );

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(analyzeWorkspaceMigration).not.toHaveBeenCalled();
  });

  it('提交迁移应作为命令执行并清除当前提案', async () => {
    const {
      analyzeWorkspaceMigration,
      applyWorkspaceMigrationPayloadToLocal,
      commitWorkspaceMigration,
      hasMeaningfulWorkspaceData,
    } = await import('@/services/workspaceMigrationService');
    const payload = {
      localFingerprint: 'fingerprint',
      idempotencyKey: 'idempotency',
      snapshot: {
        globalDraft: null,
        activeSession: null,
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      },
    };
    vi.mocked(analyzeWorkspaceMigration).mockResolvedValue({
      payload,
      result: {
        status: 'ready',
        createdCount: 0,
        copiedCount: 0,
        skippedCount: 0,
        conflictCount: 0,
        conflicts: [],
      },
    } as any);
    vi.mocked(hasMeaningfulWorkspaceData).mockResolvedValue(false);
    vi.mocked(applyWorkspaceMigrationPayloadToLocal).mockResolvedValue(undefined);
    vi.mocked(commitWorkspaceMigration).mockResolvedValue({
      status: 'completed',
      createdCount: 1,
      copiedCount: 0,
      skippedCount: 0,
      conflictCount: 0,
      conflicts: [],
    });

    const { result } = renderHook(() =>
      useWorkspaceMigration({
        status: 'signed_in',
        userId: 'user-1',
        workspaceId: 'ws-1',
      }),
    );
    await waitFor(() => expect(result.current.open).toBe(true));

    await act(async () => {
      await result.current.runMigration();
    });

    expect(commitWorkspaceMigration).toHaveBeenCalledWith(payload);
    expect(result.current.pending).toBeNull();
    expect(result.current.open).toBe(false);
  });
});
