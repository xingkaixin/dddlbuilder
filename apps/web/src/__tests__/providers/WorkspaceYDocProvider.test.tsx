import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as Y from 'yjs';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import { setupMemoryLocalStorage } from '@/__tests__/utils/memoryLocalStorage';
import { WorkspaceYDocProvider, useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';
import { prepareLegacyWorkspaceSnapshot } from '@/services/workspaceMigrationService';
import {
  deleteSavedTableFromYDoc,
  ensureWorkspaceYDocMeta,
  exportWorkspaceYDocToSnapshot,
} from '@/services/workspaceYDocAdapter';
import { WorkspaceYDocSyncClient } from '@/services/workspaceYDocSyncClient';
import { commitLegacyWorkspaceYDoc } from '@/services/workspaceYDocStorage';
import { clearLegacyWorkspaceData } from '@/services/workspaceAccountService';
import type * as WorkspaceYDocStorage from '@/services/workspaceYDocStorage';

vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    status: 'signed_in' as const,
    userId: 'user-1',
    workspaceId: 'ws-1',
  }),
}));

// 模拟 y-indexeddb 的持久化：同一 workspace 的 Y.Doc 状态（含删除墓碑）跨启动保留。
const persistence = vi.hoisted(() => ({ update: null as Uint8Array | null, committed: false }));

vi.mock('@/services/workspaceYDocStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceYDocStorage>()),
  commitLegacyWorkspaceYDoc: vi.fn(async () => {
    persistence.committed = true;
  }),
}));
vi.mock('@/services/workspaceAccountService', () => ({
  clearLegacyWorkspaceData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('y-indexeddb', async () => {
  const Yjs = await import('yjs');
  return {
    IndexeddbPersistence: class {
      whenSynced = Promise.resolve(this);
      get = async () => persistence.committed;
      constructor(_name: string, doc: Y.Doc) {
        if (persistence.update) {
          Yjs.applyUpdate(doc, persistence.update);
        }
        doc.on('update', () => {
          persistence.update = Yjs.encodeStateAsUpdate(doc);
        });
      }
      destroy() {
        return Promise.resolve();
      }
    },
  };
});

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

const legacySnapshotWithTable = (): WorkspaceSnapshot => ({
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

const renderProvider = () =>
  renderHook(() => useWorkspaceYDoc(), { wrapper: WorkspaceYDocProvider });

const startProvider = async () => {
  const view = renderProvider();
  await waitFor(() => expect(view.result.current.localSynced).toBe(true));
  return view;
};

/** 读取"上次启动"留在本地持久化里的 Y.Doc 状态。 */
const readPersistedSnapshot = () => {
  const doc = new Y.Doc();
  ensureWorkspaceYDocMeta(doc);
  if (persistence.update) Y.applyUpdate(doc, persistence.update);
  const snapshot = exportWorkspaceYDocToSnapshot(doc);
  doc.destroy();
  return snapshot;
};

describe('WorkspaceYDocProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.update = null;
    persistence.committed = false;
    setupMemoryLocalStorage();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('legacy 快照合并成功后应本地就绪并连接 Durable Object', async () => {
    prepareLegacyWorkspaceSnapshotMock.mockResolvedValue(legacySnapshotWithTable());

    const { result } = await startProvider();

    expect(WorkspaceYDocSyncClient).toHaveBeenCalledWith(
      'ws-1',
      expect.anything(),
      expect.any(Function),
    );
    expect(connect).toHaveBeenCalledTimes(1);
    expect(clearLegacyWorkspaceData).toHaveBeenCalledOnce();
    expect(vi.mocked(commitLegacyWorkspaceYDoc).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(clearLegacyWorkspaceData).mock.invocationCallOrder[0],
    );

    const snapshot = exportWorkspaceYDocToSnapshot(result.current.doc as Y.Doc);
    expect(snapshot.savedTables[0]).toMatchObject({
      normalizedName: 'legacy_table',
      createdAt: 111,
    });
  });

  it('retains the source partition when the target transaction cannot commit', async () => {
    prepareLegacyWorkspaceSnapshotMock.mockResolvedValue(legacySnapshotWithTable());
    vi.mocked(commitLegacyWorkspaceYDoc).mockRejectedValueOnce(new Error('QuotaExceededError'));
    const first = await startProvider();
    expect(clearLegacyWorkspaceData).not.toHaveBeenCalled();
    first.unmount();
    await startProvider();
    expect(clearLegacyWorkspaceData).toHaveBeenCalledOnce();
  });

  it('legacy 快照准备失败时仍应本地就绪并连接 Durable Object', async () => {
    prepareLegacyWorkspaceSnapshotMock.mockRejectedValue(new Error('QuotaExceededError'));

    const { result } = await startProvider();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(result.current.connectionState).not.toBe('error');
    expect(console.error).toHaveBeenCalledWith(
      '[workspace-yjs] legacy snapshot merge failed',
      expect.any(Error),
    );
  });

  it('迁移成功后第二次启动不应再跑 legacy 迁移', async () => {
    prepareLegacyWorkspaceSnapshotMock.mockResolvedValue(legacySnapshotWithTable());

    const first = await startProvider();
    first.unmount();
    const second = await startProvider();

    expect(prepareLegacyWorkspaceSnapshotMock).toHaveBeenCalledTimes(1);
    expect(
      exportWorkspaceYDocToSnapshot(second.result.current.doc as Y.Doc).savedTables,
    ).toHaveLength(1);
  });

  it('Y.Doc 已删除但本地分区仍存在的实体不应在第二次启动复活', async () => {
    prepareLegacyWorkspaceSnapshotMock.mockResolvedValue(legacySnapshotWithTable());

    const first = await startProvider();
    deleteSavedTableFromYDoc(first.result.current.doc as Y.Doc, 'legacy_table');
    first.unmount();

    localStorage.clear();

    expect(readPersistedSnapshot().savedTables).toEqual([]);

    const second = await startProvider();

    expect(prepareLegacyWorkspaceSnapshotMock).toHaveBeenCalledTimes(1);
    expect(exportWorkspaceYDocToSnapshot(second.result.current.doc as Y.Doc).savedTables).toEqual(
      [],
    );
  });

  it('迁移失败时不写完成标记，下次启动应重试并补齐数据', async () => {
    prepareLegacyWorkspaceSnapshotMock.mockRejectedValueOnce(new Error('IndexedDB 崩了'));
    prepareLegacyWorkspaceSnapshotMock.mockResolvedValue(legacySnapshotWithTable());

    const first = await startProvider();
    expect(exportWorkspaceYDocToSnapshot(first.result.current.doc as Y.Doc).savedTables).toEqual(
      [],
    );
    first.unmount();

    const second = await startProvider();

    expect(prepareLegacyWorkspaceSnapshotMock).toHaveBeenCalledTimes(2);
    expect(
      exportWorkspaceYDocToSnapshot(second.result.current.doc as Y.Doc).savedTables,
    ).toHaveLength(1);
  });

  it('legacy 分区没有数据时也算迁移完成，下次启动直接跳过', async () => {
    prepareLegacyWorkspaceSnapshotMock.mockResolvedValue(null);

    const first = await startProvider();
    first.unmount();
    await startProvider();

    expect(prepareLegacyWorkspaceSnapshotMock).toHaveBeenCalledTimes(1);
  });
});
