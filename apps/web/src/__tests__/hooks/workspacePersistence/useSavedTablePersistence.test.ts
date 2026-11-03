import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
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
});
