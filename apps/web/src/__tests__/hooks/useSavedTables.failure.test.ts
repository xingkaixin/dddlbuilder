import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook as testingLibraryRenderHook, act, waitFor } from '@testing-library/react';
import { useSavedTables } from '@/hooks/useSavedTables';
import type { SavedTableRecord } from '@/utils/savedTablesDb';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';

const renderHook = <Result, Props>(render: (initialProps: Props) => Result) => {
  const { wrapper } = createQueryClientWrapper();
  return testingLibraryRenderHook(render, { wrapper });
};

vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthSession: vi.fn(() => ({
    status: 'signed_out',
    configured: true,
    userId: null,
  })),
}));

const savedTableMocks = vi.hoisted(() => ({
  addSavedTable: vi.fn(),
  deleteSavedTable: vi.fn(),
  ensureSavedTableName: vi.fn((name: string) => name.trim() || '未命名表'),
  getSavedTable: vi.fn(),
  listSavedTables: vi.fn(),
  listSavedTableMetadata: vi.fn(),
  listTrashedSavedTables: vi.fn(),
  listTrashedSavedTableMetadata: vi.fn(),
  moveSavedTableToTrash: vi.fn(),
  restoreSavedTableFromTrash: vi.fn(),
  normalizeSavedTableName: vi.fn((name: string) => name.trim().toLowerCase()),
  updateSavedTable: vi.fn(),
  updateSavedTables: vi.fn(),
}));

vi.mock('@/utils/savedTablesDb', () => ({
  addSavedTable: savedTableMocks.addSavedTable,
  deleteSavedTable: savedTableMocks.deleteSavedTable,
  ensureSavedTableName: savedTableMocks.ensureSavedTableName,
  getSavedTable: savedTableMocks.getSavedTable,
  listSavedTables: savedTableMocks.listSavedTables,
  listSavedTableMetadata: savedTableMocks.listSavedTableMetadata,
  listTrashedSavedTables: savedTableMocks.listTrashedSavedTables,
  listTrashedSavedTableMetadata: savedTableMocks.listTrashedSavedTableMetadata,
  moveSavedTableToTrash: savedTableMocks.moveSavedTableToTrash,
  restoreSavedTableFromTrash: savedTableMocks.restoreSavedTableFromTrash,
  normalizeSavedTableName: savedTableMocks.normalizeSavedTableName,
  updateSavedTable: savedTableMocks.updateSavedTable,
  updateSavedTables: savedTableMocks.updateSavedTables,
}));

const createState = (name: string) => ({
  tableName: name,
  tableComment: '测试',
  dbType: 'mysql' as const,
  rows: [],
  addCount: 1,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

const createRecord = (
  normalizedName: string,
  name: string,
  folderId?: string,
): SavedTableRecord => ({
  normalizedName,
  name,
  folderId,
  state: createState(name),
  createdAt: 1,
  updatedAt: 1,
});

type SaveResult =
  | { ok: true; normalizedName: string }
  | {
      ok: false;
      reason: 'duplicate' | 'not_found' | 'error';
      message?: string;
    };

describe('useSavedTables failure states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedTableMocks.listSavedTableMetadata.mockResolvedValue([]);
    savedTableMocks.listSavedTables.mockResolvedValue([]);
    savedTableMocks.listTrashedSavedTableMetadata.mockResolvedValue([]);
    savedTableMocks.listTrashedSavedTables.mockResolvedValue([]);
    savedTableMocks.getSavedTable.mockResolvedValue(null);
  });

  it('should return error result when saveTable throws', async () => {
    savedTableMocks.addSavedTable.mockRejectedValueOnce(new Error('写入失败'));

    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let response: SaveResult | undefined;
    await act(async () => {
      response = await result.current.saveTable('demo', createState('demo'));
    });

    expect(response).toEqual({
      ok: false,
      reason: 'error',
      message: '写入失败',
    });
  });

  it('should return null when loadTable cannot find record', async () => {
    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const loaded = await result.current.loadTable('missing-table');
    expect(loaded).toBeNull();
  });

  it('should set default refresh error when list throws non-Error', async () => {
    savedTableMocks.listSavedTableMetadata.mockRejectedValueOnce('boom');

    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('读取失败');
  });

  it('overwriteTable should cover not_found and error branches', async () => {
    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let notFound: SaveResult | undefined;
    await act(async () => {
      notFound = await result.current.overwriteTable('missing', createState('missing'));
    });
    expect(notFound).toEqual({ ok: false, reason: 'not_found' });

    savedTableMocks.getSavedTable.mockResolvedValueOnce(createRecord('alpha', 'Alpha'));
    savedTableMocks.updateSavedTable.mockRejectedValueOnce(new Error('更新异常'));

    let failed: SaveResult | undefined;
    await act(async () => {
      failed = await result.current.overwriteTable('alpha', createState('next'));
    });
    expect(failed).toEqual({
      ok: false,
      reason: 'error',
      message: '更新异常',
    });
  });

  it('deleteTable should return error when deletion throws', async () => {
    savedTableMocks.moveSavedTableToTrash.mockRejectedValueOnce(new Error('删除失败'));

    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let response: SaveResult | undefined;
    await act(async () => {
      response = await result.current.deleteTable('demo');
    });

    expect(response).toEqual({
      ok: false,
      reason: 'error',
      message: '删除失败',
    });
  });

  it('renameTable should cover not_found and duplicate branches', async () => {
    const sourceRecord = createRecord('alpha', 'Alpha');
    const duplicateRecord = createRecord('beta', 'Beta');

    savedTableMocks.getSavedTable
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sourceRecord)
      .mockResolvedValueOnce(duplicateRecord);

    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let missing: SaveResult | undefined;
    await act(async () => {
      missing = await result.current.renameTable('missing', 'New');
    });
    expect(missing).toEqual({ ok: false, reason: 'not_found' });

    let duplicate: SaveResult | undefined;
    await act(async () => {
      duplicate = await result.current.renameTable('alpha', 'beta');
    });
    expect(duplicate).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('renameTable should cover update/add-delete/error branches', async () => {
    const sourceRecord = createRecord('alpha', 'Alpha');
    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    savedTableMocks.getSavedTable
      .mockResolvedValueOnce(sourceRecord)
      .mockResolvedValueOnce(sourceRecord);
    let sameName: SaveResult | undefined;
    await act(async () => {
      sameName = await result.current.renameTable('alpha', ' alpha ');
    });
    expect(sameName).toEqual({ ok: true, normalizedName: 'alpha' });

    savedTableMocks.getSavedTable.mockResolvedValueOnce(sourceRecord).mockResolvedValueOnce(null);
    let changedName: SaveResult | undefined;
    await act(async () => {
      changedName = await result.current.renameTable('alpha', 'Gamma');
    });
    expect(changedName).toEqual({ ok: true, normalizedName: 'gamma' });

    savedTableMocks.getSavedTable
      .mockResolvedValueOnce(sourceRecord)
      .mockResolvedValueOnce(sourceRecord);
    savedTableMocks.updateSavedTable.mockRejectedValueOnce(new Error('重命名异常'));
    let failed: SaveResult | undefined;
    await act(async () => {
      failed = await result.current.renameTable('alpha', ' alpha ');
    });
    expect(failed).toEqual({
      ok: false,
      reason: 'error',
      message: '重命名异常',
    });
  });

  it('moveTableToFolder should cover not_found/success/error branches', async () => {
    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    savedTableMocks.getSavedTable.mockResolvedValueOnce(null);
    let notFound: SaveResult | undefined;
    await act(async () => {
      notFound = await result.current.moveTableToFolder('missing', 'folder-1');
    });
    expect(notFound).toEqual({ ok: false, reason: 'not_found' });

    savedTableMocks.getSavedTable
      .mockResolvedValueOnce(createRecord('alpha', 'Alpha'))
      .mockResolvedValueOnce(createRecord('alpha', 'Alpha'));
    savedTableMocks.updateSavedTable
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('移动异常'));

    let success: SaveResult | undefined;
    await act(async () => {
      success = await result.current.moveTableToFolder('alpha', 'folder-a');
    });
    expect(success).toEqual({ ok: true, normalizedName: 'alpha' });

    let failed: SaveResult | undefined;
    await act(async () => {
      failed = await result.current.moveTableToFolder('alpha', 'folder-b');
    });
    expect(failed).toEqual({
      ok: false,
      reason: 'error',
      message: '移动异常',
    });
  });

  it('批量导入应一次写入最终记录，并整体报告写入失败', async () => {
    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let imported;
    await act(async () => {
      imported = await result.current.importTables({
        items: [
          { name: 'Alpha', state: createState('alpha') },
          { name: 'Beta', state: createState('beta') },
        ],
        conflictStrategy: 'skip',
        folderId: 'folder-a',
      });
    });

    expect(imported).toEqual({ successCount: 2, skipCount: 0, failCount: 0 });
    expect(savedTableMocks.updateSavedTables).toHaveBeenCalledTimes(1);
    expect(savedTableMocks.updateSavedTables).toHaveBeenCalledWith(
      [
        expect.objectContaining({ normalizedName: 'alpha', folderId: 'folder-a' }),
        expect.objectContaining({ normalizedName: 'beta', folderId: 'folder-a' }),
      ],
      { kind: 'anonymous' },
    );

    savedTableMocks.updateSavedTables.mockRejectedValueOnce(new Error('事务失败'));
    let failed;
    await act(async () => {
      failed = await result.current.importTables({
        items: [{ name: 'Gamma', state: createState('gamma') }],
        conflictStrategy: 'skip',
      });
    });
    expect(failed).toEqual({ successCount: 0, skipCount: 0, failCount: 1 });
  });
});
