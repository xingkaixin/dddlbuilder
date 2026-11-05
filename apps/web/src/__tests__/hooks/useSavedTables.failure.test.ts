import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook as testingLibraryRenderHook, act, waitFor } from '@testing-library/react';
import { useSavedTables } from '@/hooks/useSavedTables';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';

const renderHook = <Result, Props>(render: (initialProps: Props) => Result) => {
  const { wrapper } = createQueryClientWrapper();

  return testingLibraryRenderHook(render, { wrapper });
};

// oxlint-disable-next-line anti-slop/no-module-mocking -- Fix the unauthenticated provider state while testing saved-table failure handling.
vi.mock('@/auth/AuthSessionProvider', () => {
  const useAuthIdentity = vi.fn(() => ({
    status: 'signed_out',
    configured: true,
    userId: null,
  }));

  return { useAuthIdentity };
});

const savedTableMocks = vi.hoisted(() => ({
  addSavedTable: vi.fn(),
  deleteSavedTable: vi.fn(),
  ensureSavedTableName: vi.fn((name: string) => name.trim() || '未命名表'),
  getSavedTable: vi.fn(),
  listSavedTables: vi.fn(),
  listSavedTableMetadata: vi.fn(),
  listTrashedSavedTables: vi.fn(),
  listTrashedSavedTableMetadata: vi.fn(),
  normalizeSavedTableName: vi.fn((name: string) => name.trim().toLowerCase()),
  replaceSavedTable: vi.fn(),
  updateSavedTable: vi.fn(),
  updateSavedTables: vi.fn(),
  updateSavedTableState: vi.fn(),
  updateSavedTableMetadata: vi.fn(),
}));
const tableVersionMocks = vi.hoisted(() => ({
  countVersions: vi.fn(),
  createVersion: vi.fn(),
}));
const historyCleanupMocks = vi.hoisted(() => ({
  deleteIndexedDbSavedTablePermanently: vi.fn(),
}));
const reviewHistoryMocks = vi.hoisted(() => ({
  migrateReviewsToTable: vi.fn(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace IndexedDB persistence with controllable failures for the hook orchestration tests.
vi.mock('@/utils/savedTablesDb', () => ({
  addSavedTable: savedTableMocks.addSavedTable,
  deleteSavedTable: savedTableMocks.deleteSavedTable,
  ensureSavedTableName: savedTableMocks.ensureSavedTableName,
  getSavedTable: savedTableMocks.getSavedTable,
  listSavedTables: savedTableMocks.listSavedTables,
  listSavedTableMetadata: savedTableMocks.listSavedTableMetadata,
  listTrashedSavedTables: savedTableMocks.listTrashedSavedTables,
  listTrashedSavedTableMetadata: savedTableMocks.listTrashedSavedTableMetadata,
  listSavedTablesByStatus: async (scope: WorkspaceScope) => ({
    active: await savedTableMocks.listSavedTables(scope),
    trashed: await savedTableMocks.listTrashedSavedTables(scope),
  }),
  listSavedTableMetadataByStatus: async (scope: WorkspaceScope) => ({
    active: await savedTableMocks.listSavedTableMetadata(scope),
    trashed: await savedTableMocks.listTrashedSavedTableMetadata(scope),
  }),
  normalizeSavedTableName: savedTableMocks.normalizeSavedTableName,
  replaceSavedTable: savedTableMocks.replaceSavedTable,
  updateSavedTable: savedTableMocks.updateSavedTable,
  updateSavedTables: savedTableMocks.updateSavedTables,
  updateSavedTableState: savedTableMocks.updateSavedTableState,
  updateSavedTableMetadata: savedTableMocks.updateSavedTableMetadata,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Keep version bookkeeping deterministic while exercising saved-table failure paths.
vi.mock('@/utils/tableVersions', () => ({
  countVersions: tableVersionMocks.countVersions,
  createVersion: tableVersionMocks.createVersion,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Inject review migration failures to verify user-visible recovery behavior.
vi.mock('@/utils/reviewHistory', () => ({
  migrateReviewsToTable: reviewHistoryMocks.migrateReviewsToTable,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Avoid IndexedDB cleanup side effects while testing the hook's failure handling.
vi.mock('@/services/workspaceHistoryCleanup', () => ({
  deleteIndexedDbSavedTablePermanently: historyCleanupMocks.deleteIndexedDbSavedTablePermanently,
  finalizeWorkspaceEntityDeletion: vi.fn(),
}));

const createState = (name: string) => ({
  schemaName: '',
  tableName: name,
  tableComment: '测试',
  dbType: 'mysql' as const,
  sqlFormatMode: 'compact' as const,
  rows: [],
  addCount: 1,
  indexes: [],
  authInput: '',
  authObjects: [],
});

const createRecord = (normalizedName: string, name: string): SavedTableRecord => ({
  normalizedName,
  name,
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
    vi.resetAllMocks();
    savedTableMocks.ensureSavedTableName.mockImplementation(
      (name: string) => name.trim() || '未命名表',
    );
    savedTableMocks.normalizeSavedTableName.mockImplementation((name: string) =>
      name.trim().toLowerCase(),
    );
    savedTableMocks.listSavedTableMetadata.mockResolvedValue([]);
    savedTableMocks.listSavedTables.mockResolvedValue([]);
    savedTableMocks.listTrashedSavedTableMetadata.mockResolvedValue([]);
    savedTableMocks.listTrashedSavedTables.mockResolvedValue([]);
    savedTableMocks.getSavedTable.mockResolvedValue(null);
    historyCleanupMocks.deleteIndexedDbSavedTablePermanently.mockResolvedValue(undefined);
    reviewHistoryMocks.migrateReviewsToTable.mockResolvedValue(undefined);
  });

  it('历史清理失败时保留表记录', async () => {
    savedTableMocks.getSavedTable.mockResolvedValueOnce({
      ...createRecord('demo', 'Demo'),
      tableId: 'table-demo',
    });
    historyCleanupMocks.deleteIndexedDbSavedTablePermanently.mockRejectedValueOnce(
      new Error('历史清理失败'),
    );
    const { result } = renderHook(() => useSavedTables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let response: SaveResult | undefined;
    await act(async () => {
      response = await result.current.deleteTablePermanently('demo');
    });

    expect(response).toEqual({
      ok: false,
      reason: 'error',
      message: '历史清理失败',
    });
    expect(historyCleanupMocks.deleteIndexedDbSavedTablePermanently).toHaveBeenCalledWith({
      scope: { kind: 'anonymous' },
      tableId: 'table-demo',
      normalizedName: 'demo',
    });
    expect(savedTableMocks.deleteSavedTable).not.toHaveBeenCalled();
  });
});
