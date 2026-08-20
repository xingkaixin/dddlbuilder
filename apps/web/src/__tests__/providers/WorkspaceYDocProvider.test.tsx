import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type * as Y from 'yjs';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import { WorkspaceYDocProvider, useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';
import { prepareLegacyWorkspaceSnapshot } from '@/services/workspaceMigrationService';
import { exportWorkspaceYDocToSnapshot } from '@/services/workspaceYDocAdapter';
import { WorkspaceYDocSyncClient } from '@/services/workspaceYDocSyncClient';

vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    status: 'signed_in' as const,
    userId: 'user-1',
    workspaceId: 'ws-1',
  }),
}));

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    whenSynced = Promise.resolve(this);
    destroy() {
      return Promise.resolve();
    }
  },
}));

vi.mock('@/services/workspaceMigrationService', () => ({
  prepareLegacyWorkspaceSnapshot: vi.fn(),
}));

const connect = vi.fn(() => Promise.resolve());
const destroy = vi.fn();

vi.mock('@/services/workspaceYDocSyncClient', () => ({
  WorkspaceYDocSyncClient: vi.fn(
    class {
      connect = connect;
      destroy = destroy;
    },
  ),
}));

const prepareLegacyWorkspaceSnapshotMock = vi.mocked(prepareLegacyWorkspaceSnapshot);

const emptySnapshot = (): WorkspaceSnapshot => ({
  globalDraft: null,
  drafts: [],
  savedTables: [],
  savedDrafts: [],
  folders: [],
});

const renderProvider = () =>
  renderHook(() => useWorkspaceYDoc(), { wrapper: WorkspaceYDocProvider });

describe('WorkspaceYDocProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('legacy 快照合并成功后应本地就绪并连接 Durable Object', async () => {
    prepareLegacyWorkspaceSnapshotMock.mockResolvedValue({
      ...emptySnapshot(),
      savedTables: [
        {
          normalizedName: 'legacy_table',
          name: 'legacy_table',
          state: {
            schemaName: '',
            tableName: 'legacy_table',
            tableComment: '',
            dbType: 'mysql',
            sqlFormatMode: 'compact',
            rows: [],
            addCount: 10,
            indexInput: '',
            currentIndexFields: [],
            indexes: [],
            authInput: '',
            authObjects: [],
          },
          createdAt: 111,
          updatedAt: 222,
        },
      ],
    });

    const { result } = renderProvider();

    await waitFor(() => expect(result.current.localSynced).toBe(true));
    expect(WorkspaceYDocSyncClient).toHaveBeenCalledWith(
      'ws-1',
      expect.anything(),
      expect.any(Function),
    );
    expect(connect).toHaveBeenCalledTimes(1);

    const snapshot = exportWorkspaceYDocToSnapshot(result.current.doc as Y.Doc);
    expect(snapshot.savedTables[0]).toMatchObject({
      normalizedName: 'legacy_table',
      createdAt: 111,
    });
  });

  it('legacy 快照准备失败时仍应本地就绪并连接 Durable Object', async () => {
    prepareLegacyWorkspaceSnapshotMock.mockRejectedValue(new Error('QuotaExceededError'));

    const { result } = renderProvider();

    await waitFor(() => expect(result.current.localSynced).toBe(true));
    expect(connect).toHaveBeenCalledTimes(1);
    expect(result.current.connectionState).not.toBe('error');
    expect(console.error).toHaveBeenCalledWith(
      '[workspace-yjs] legacy snapshot merge failed',
      expect.any(Error),
    );
  });
});
