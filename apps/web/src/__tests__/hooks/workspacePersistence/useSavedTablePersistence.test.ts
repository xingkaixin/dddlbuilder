import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  deleteWorkspaceSavedTable,
  getWorkspaceSavedTable,
  upsertWorkspaceSavedTable,
} from '@ddlbuilder/workspace-core';
import { useSavedTablePersistence } from '@/hooks/workspacePersistence/useSavedTablePersistence';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import type { WorkspaceEntityTarget, WorkspaceEntityWrite } from '@/utils/workspaceEntityDeletion';

const mocks = vi.hoisted(() => ({
  beginDeletion: vi.fn(),
  cancelDeletion: vi.fn(),
  deleteFromYDoc: vi.fn(),
  deleteLocal: vi.fn(),
  ensureDeletion: vi.fn(),
  finalizeDeletion: vi.fn(),
  getFromYDoc: vi.fn(),
  recreateToYDoc: vi.fn(),
  runEntityWrites: vi.fn(),
  transact: vi.fn(),
  upsertToYDoc: vi.fn(),
}));

// SAFETY: beforeEach replaces this temporary holder with a real Y.Doc before any hook runs.
const workspace = vi.hoisted(() => ({ yDoc: null as Y.Doc | null }));

const scope = {
  kind: 'user' as const,
  userId: 'user-1',
  workspaceId: 'workspace-1',
};

const record: SavedTableRecord = {
  tableId: 'table-1',
  normalizedName: 'users',
  name: 'Users',
  state: {
    schemaName: '',
    tableName: 'users',
    tableComment: '',
    dbType: 'mysql' as const,
    sqlFormatMode: 'compact',
    rows: [],
    addCount: 1,
    indexes: [],
    authInput: '',
    authObjects: [],
  },
  createdAt: 1,
  updatedAt: 1,
};

// oxlint-disable-next-line anti-slop/no-module-mocking -- 持久化适配器替换用于隔离 hook 的删除编排与提交顺序。
vi.mock('@/hooks/workspacePersistence/useWorkspaceAuthority', () => ({
  useWorkspaceAuthority: () => ({
    scope,
    storage: {
      kind: 'ydoc' as const,
      scope,
      yDoc: workspace.yDoc,
      transact: mocks.transact,
    },
    refresh: vi.fn(),
  }),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 持久化适配器替换用于隔离 hook 的删除编排与提交顺序。
vi.mock('@/utils/savedTablesDb', () => ({
  addSavedTable: vi.fn(),
  deleteSavedTable: mocks.deleteLocal,
  getSavedTable: vi.fn(),
  listSavedTables: vi.fn(),
  listTrashedSavedTables: vi.fn(),
  replaceSavedTable: vi.fn(),
  updateSavedTable: vi.fn(),
  updateSavedTables: vi.fn(),
  updateSavedTableState: vi.fn(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 持久化适配器替换用于隔离 hook 的删除编排与提交顺序。
vi.mock('@/services/workspaceHistoryCleanup', () => ({
  deleteIndexedDbSavedTablePermanently: vi.fn(),
  finalizeWorkspaceEntityDeletion: mocks.finalizeDeletion,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 持久化适配器替换用于隔离 hook 的删除编排与提交顺序。
vi.mock('@/utils/workspaceEntityDeletion', () => ({
  beginWorkspaceEntityDeletion: mocks.beginDeletion,
  cancelWorkspaceEntityDeletion: mocks.cancelDeletion,
  ensureWorkspaceEntityDeletion: mocks.ensureDeletion,
  commitWorkspaceEntityWrites: mocks.runEntityWrites,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 持久化适配器替换用于隔离 hook 的删除编排与提交顺序。
vi.mock('@/services/workspaceYDocAdapter', () => ({
  deleteSavedTableFromYDoc: mocks.deleteFromYDoc,
  getSavedTableFromYDoc: mocks.getFromYDoc,
  listSavedTableRecordsFromYDoc: vi.fn(),
  listTrashedSavedTableRecordsFromYDoc: vi.fn(),
  renameSavedTableInYDoc: vi.fn(),
  recreateSavedTableInYDoc: mocks.recreateToYDoc,
  upsertSavedTableInYDoc: mocks.upsertToYDoc,
}));

describe('useSavedTablePersistence permanent deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspace.yDoc = new Y.Doc();
    mocks.beginDeletion.mockImplementation(
      async (_target: WorkspaceEntityTarget, commit?: () => void) => {
        commit?.();

        return 'delete-operation-1';
      },
    );
    mocks.cancelDeletion.mockResolvedValue(undefined);
    mocks.deleteLocal.mockResolvedValue(undefined);
    mocks.finalizeDeletion.mockResolvedValue(undefined);
    mocks.getFromYDoc.mockReturnValue(record);
    mocks.ensureDeletion.mockResolvedValue({ operationId: 'recovered-operation', created: true });
    mocks.runEntityWrites.mockImplementation(
      async (_writes: WorkspaceEntityWrite[], commit: () => void) => commit(),
    );
    mocks.transact.mockImplementation((operation: (doc: Y.Doc) => void) => {
      if (!workspace.yDoc) throw new Error('Workspace Y.Doc not initialized');

      operation(workspace.yDoc);
    });
  });

  it('先持久化删除所有权，主记录提交后原子收尾历史', async () => {
    const { result } = renderHook(() => useSavedTablePersistence());

    await act(async () => result.current.deleteTablePermanently(record));

    expect(mocks.beginDeletion).toHaveBeenCalledWith(
      {
        scope,
        tableId: 'table-1',
        normalizedName: 'users',
      },
      expect.any(Function),
    );
    expect(mocks.deleteLocal).toHaveBeenCalledWith(
      { tableId: 'table-1', normalizedName: 'users' },
      scope,
    );
    expect(mocks.finalizeDeletion).toHaveBeenCalledWith(
      { scope, tableId: 'table-1', normalizedName: 'users' },
      'delete-operation-1',
    );
    expect(mocks.beginDeletion.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteLocal.mock.invocationCallOrder[0],
    );
    expect(mocks.deleteFromYDoc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.finalizeDeletion.mock.invocationCallOrder[0],
    );
  });

  it('主记录删除失败时不执行历史收尾', async () => {
    mocks.transact.mockImplementationOnce(() => {
      throw new Error('Y.Doc delete failed');
    });
    const { result } = renderHook(() => useSavedTablePersistence());

    await act(async () => {
      await expect(result.current.deleteTablePermanently(record)).rejects.toThrow(
        'Y.Doc delete failed',
      );
    });

    expect(mocks.cancelDeletion).not.toHaveBeenCalled();
    expect(mocks.finalizeDeletion).not.toHaveBeenCalled();
  });

  it('Y.Doc 已提交后历史收尾失败仍按删除事实返回成功', async () => {
    const error = new Error('History cleanup failed');
    mocks.finalizeDeletion.mockRejectedValueOnce(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useSavedTablePersistence());

    await act(async () => {
      await expect(result.current.deleteTablePermanently(record)).resolves.toBeUndefined();
    });

    expect(mocks.cancelDeletion).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('[workspace] table history cleanup failed', error);
    consoleError.mockRestore();
  });

  it('等待本地 cache 清理前已经完成唯一一次主删除', async () => {
    let releaseCacheCleanup: (() => void) | undefined;
    mocks.deleteLocal.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        releaseCacheCleanup = resolve;
      }),
    );
    const { result } = renderHook(() => useSavedTablePersistence());

    const deletion = result.current.deleteTablePermanently(record);
    await vi.waitFor(() => expect(mocks.deleteFromYDoc).toHaveBeenCalledOnce());
    expect(mocks.finalizeDeletion).not.toHaveBeenCalled();

    releaseCacheCleanup?.();
    await deletion;

    expect(mocks.deleteFromYDoc).toHaveBeenCalledOnce();
    expect(mocks.finalizeDeletion).toHaveBeenCalledOnce();
  });

  it('普通写入不能按记录形状冒充恢复', async () => {
    const { result } = renderHook(() => useSavedTablePersistence());

    await act(async () => result.current.putTable(record));

    expect(mocks.runEntityWrites).toHaveBeenCalledWith(
      [
        {
          target: { scope, tableId: 'table-1', normalizedName: 'users' },
          mode: 'update',
        },
      ],
      expect.any(Function),
    );
  });

  it('Y.Doc state update 先提交实体 marker 事务', async () => {
    const { result } = renderHook(() => useSavedTablePersistence());

    await act(async () => {
      await result.current.updateTableState('users', {
        ...record.state,
        tableName: 'updated_users',
      });
    });

    expect(mocks.runEntityWrites).toHaveBeenCalledWith(
      [{ target: { scope, tableId: 'table-1', normalizedName: 'users' }, mode: 'update' }],
      expect.any(Function),
    );
    expect(mocks.upsertToYDoc).toHaveBeenCalledWith(
      expect.any(Y.Doc),
      expect.objectContaining({ state: expect.objectContaining({ tableName: 'updated_users' }) }),
    );
  });

  it('显式恢复才使用 activate 意图', async () => {
    const { result } = renderHook(() => useSavedTablePersistence());

    await act(async () => result.current.replaceTable('users', record, 'activate'));

    expect(mocks.runEntityWrites).toHaveBeenCalledWith(
      [
        {
          target: { scope, tableId: 'table-1', normalizedName: 'users' },
          mode: 'activate',
        },
      ],
      expect.any(Function),
    );
  });

  it('显式重新激活总会写入新的 Y.Doc 父节点事实', async () => {
    const { result } = renderHook(() => useSavedTablePersistence());

    await act(async () => result.current.putTable(record, 'update', 'activate'));

    expect(mocks.recreateToYDoc).toHaveBeenCalledWith(expect.any(Y.Doc), record);
    expect(mocks.upsertToYDoc).not.toHaveBeenCalled();
  });

  it('observer 在 Y.Doc 删除提交后抛错时仍返回成功', async () => {
    const doc = new Y.Doc();
    workspace.yDoc = doc;
    upsertWorkspaceSavedTable(doc, { ...record, tableId: 'table-1' });
    mocks.deleteFromYDoc.mockImplementation(deleteWorkspaceSavedTable);
    mocks.getFromYDoc.mockImplementation(getWorkspaceSavedTable);
    mocks.transact.mockImplementation((operation: (current: Y.Doc) => void) => {
      doc.transact(() => {
        operation(doc);
      });
    });
    const tables = doc.getMap('savedTables');

    const throwAfterDelete = () => {
      throw new Error('Observer failed after commit');
    };
    tables.observe(throwAfterDelete);
    const { result } = renderHook(() => useSavedTablePersistence());

    await act(async () => {
      await expect(result.current.deleteTablePermanently(record)).resolves.toBeUndefined();
    });

    expect(getWorkspaceSavedTable(doc, record)).toBeNull();
    tables.unobserve(throwAfterDelete);
    doc.destroy();
  });
});
