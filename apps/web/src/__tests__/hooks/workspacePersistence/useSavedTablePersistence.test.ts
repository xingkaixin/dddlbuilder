import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSavedTablePersistence } from '@/hooks/workspacePersistence/useSavedTablePersistence';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';

const mocks = vi.hoisted(() => ({
  deleteLocal: vi.fn(),
  deleteFromYDoc: vi.fn(),
  deleteVersions: vi.fn(),
  deleteReviews: vi.fn(),
  transact: vi.fn(),
}));

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
    rows: [],
    addCount: 1,
    indexes: [],
    authInput: '',
    authObjects: [],
  },
  createdAt: 1,
  updatedAt: 1,
};

vi.mock('@/hooks/workspacePersistence/useWorkspaceAuthority', () => ({
  useWorkspaceAuthority: () => ({
    scope,
    storage: {
      kind: 'ydoc' as const,
      scope,
      yDoc: {},
      transact: mocks.transact,
    },
    refresh: vi.fn(),
  }),
}));

vi.mock('@/utils/savedTablesDb', () => ({
  addSavedTable: vi.fn(),
  deleteSavedTable: mocks.deleteLocal,
  getSavedTable: vi.fn(),
  listSavedTables: vi.fn(),
  listTrashedSavedTables: vi.fn(),
  updateSavedTable: vi.fn(),
  updateSavedTables: vi.fn(),
  updateSavedTableState: vi.fn(),
}));

vi.mock('@/utils/tableVersions', () => ({
  deleteAllVersions: mocks.deleteVersions,
}));

vi.mock('@/utils/reviewHistory', () => ({
  deleteAllReviews: mocks.deleteReviews,
}));

vi.mock('@/services/workspaceYDocAdapter', () => ({
  deleteSavedTableFromYDoc: mocks.deleteFromYDoc,
  getSavedTableFromYDoc: vi.fn(),
  listSavedTableRecordsFromYDoc: vi.fn(),
  listTrashedSavedTableRecordsFromYDoc: vi.fn(),
  renameSavedTableInYDoc: vi.fn(),
  upsertSavedTableInYDoc: vi.fn(),
}));

describe('useSavedTablePersistence permanent deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteVersions.mockResolvedValue(undefined);
    mocks.deleteReviews.mockResolvedValue(undefined);
    mocks.deleteLocal.mockResolvedValue(undefined);
    mocks.transact.mockImplementation((operation: (doc: object) => void) => operation({}));
  });

  it('并行清理历史并在两者完成后删除主记录', async () => {
    let finishVersions: () => void = () => undefined;
    let finishReviews: () => void = () => undefined;
    mocks.deleteVersions.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishVersions = resolve;
      }),
    );
    mocks.deleteReviews.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishReviews = resolve;
      }),
    );
    const { result } = renderHook(() => useSavedTablePersistence());

    let deletion: Promise<void> = Promise.resolve();
    act(() => {
      deletion = result.current.deleteTablePermanently(record);
    });

    expect(mocks.deleteVersions).toHaveBeenCalledOnce();
    expect(mocks.deleteReviews).toHaveBeenCalledOnce();
    expect(mocks.deleteLocal).not.toHaveBeenCalled();

    finishVersions();
    await Promise.resolve();
    expect(mocks.deleteLocal).not.toHaveBeenCalled();

    finishReviews();
    await act(async () => deletion);

    expect(mocks.deleteLocal).toHaveBeenCalledWith(
      { tableId: 'table-1', normalizedName: 'users' },
      scope,
    );
    expect(mocks.deleteLocal.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteFromYDoc.mock.invocationCallOrder[0],
    );
  });

  it('Y.Doc 删除失败时保留权威记录以供重试', async () => {
    mocks.transact.mockImplementationOnce(() => {
      throw new Error('Y.Doc delete failed');
    });
    const { result } = renderHook(() => useSavedTablePersistence());

    await act(async () => {
      await expect(result.current.deleteTablePermanently(record)).rejects.toThrow(
        'Y.Doc delete failed',
      );
    });
    expect(mocks.deleteFromYDoc).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.deleteTablePermanently(record);
    });

    expect(mocks.deleteLocal).toHaveBeenCalledTimes(2);
    expect(mocks.deleteFromYDoc).toHaveBeenCalledWith(
      {},
      { tableId: 'table-1', normalizedName: 'users' },
    );
  });
});
