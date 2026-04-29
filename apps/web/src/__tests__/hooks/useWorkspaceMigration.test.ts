import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceMigration } from '@/hooks/useWorkspaceMigration';

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
      }),
    );

    await waitFor(() => {
      expect(result.current.open).toBe(true);
    });

    expect(applyWorkspaceMigrationPayloadToLocal).toHaveBeenCalledWith(payload, {
      kind: 'user',
      userId: 'user-1',
    });
  });
});
