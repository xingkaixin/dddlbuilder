import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSavedTables } from '@/hooks/useSavedTables';

const savedTableMocks = vi.hoisted(() => ({
  addSavedTable: vi.fn(),
  deleteSavedTable: vi.fn(),
  ensureSavedTableName: vi.fn((name: string) => name.trim() || '未命名表'),
  getSavedTable: vi.fn(),
  listSavedTableMetadata: vi.fn(),
  normalizeSavedTableName: vi.fn((name: string) => name.trim().toLowerCase()),
  updateSavedTable: vi.fn(),
}));

vi.mock('@/utils/savedTablesDb', () => ({
  addSavedTable: savedTableMocks.addSavedTable,
  deleteSavedTable: savedTableMocks.deleteSavedTable,
  ensureSavedTableName: savedTableMocks.ensureSavedTableName,
  getSavedTable: savedTableMocks.getSavedTable,
  listSavedTableMetadata: savedTableMocks.listSavedTableMetadata,
  normalizeSavedTableName: savedTableMocks.normalizeSavedTableName,
  updateSavedTable: savedTableMocks.updateSavedTable,
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

describe('useSavedTables failure states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedTableMocks.listSavedTableMetadata.mockResolvedValue([]);
    savedTableMocks.getSavedTable.mockResolvedValue(null);
  });

  it('should return error result when saveTable throws', async () => {
    savedTableMocks.addSavedTable.mockRejectedValueOnce(new Error('写入失败'));

    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let response:
      | { ok: true; normalizedName: string }
      | {
          ok: false;
          reason: 'duplicate' | 'not_found' | 'error';
          message?: string;
        }
      | undefined;

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
    savedTableMocks.getSavedTable.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const loaded = await result.current.loadTable('missing-table');
    expect(loaded).toBeNull();
  });
});
