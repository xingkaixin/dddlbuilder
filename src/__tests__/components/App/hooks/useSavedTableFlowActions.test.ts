import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@/types';
import type { UseDialogStateReturn } from '@/hooks/useDialogState';
import { useSavedTableFlowActions } from '@/components/App/hooks/useSavedTableFlowActions';

vi.mock('@/utils/tableVersions', () => ({
  createVersion: vi.fn().mockResolvedValue(undefined),
}));

const createState = (tableName: string): PersistedState => ({
  tableName,
  tableComment: '',
  dbType: 'mysql',
  rows: [],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

const createDialog = <TData>(data: TData): UseDialogStateReturn<TData> => ({
  open: false,
  data,
  error: '',
  openDialog: vi.fn(),
  closeDialog: vi.fn(),
  updateData: vi.fn(),
  setError: vi.fn(),
  clearError: vi.fn(),
  resetData: vi.fn(),
});

const createSavedTableSummary = (name: string, normalizedName: string) => ({
  name,
  normalizedName,
  dbType: 'mysql',
  fieldCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

describe('useSavedTableFlowActions', () => {
  it('首次保存成功后应切换到 saved_table 工作区', async () => {
    const state = createState('Users');
    const saveDialog = createDialog({
      name: 'Users',
      queuedLoadAfterSave: null,
    });

    const setLoadedTableNormalizedName = vi.fn();
    const setLoadedTableName = vi.fn();
    const setLoadedTableSignature = vi.fn();
    const setWorkspaceSnapshot = vi.fn();

    const { result } = renderHook(() =>
      useSavedTableFlowActions({
        tableName: 'Users',
        hasLoadedTable: false,
        isLoadedDirty: false,
        canSaveCurrent: true,
        loadedTableNormalizedName: null,
        loadedTableName: null,
        loadedTableSignature: null,
        setLoadedTableNormalizedName,
        setLoadedTableName,
        setLoadedTableSignature,
        setSavedTablesDrawerOpen: vi.fn(),
        saveDialog,
        loadConfirmDialog: createDialog({ pendingTarget: null }),
        renameDialog: createDialog({ name: '', target: null }),
        deleteDialog: createDialog({ target: null }),
        buildPersistedState: () => state,
        serializePersistedState: (nextState) => JSON.stringify(nextState),
        applySavedState: vi.fn(),
        loadTable: vi.fn(),
        renameTable: vi.fn(),
        deleteTable: vi.fn(),
        saveTable: vi
          .fn()
          .mockResolvedValue({ ok: true, normalizedName: 'users' }),
        overwriteTable: vi.fn(),
        showToast: vi.fn(),
        trackEvent: vi.fn(),
        setWorkspaceSnapshot,
      }),
    );

    await act(async () => {
      await result.current.handleConfirmSave();
    });

    const signature = JSON.stringify(state);
    expect(setLoadedTableNormalizedName).toHaveBeenCalledWith('users');
    expect(setLoadedTableName).toHaveBeenCalledWith('Users');
    expect(setLoadedTableSignature).toHaveBeenCalledWith(signature);
    expect(setWorkspaceSnapshot).toHaveBeenCalledWith(
      {
        kind: 'saved_table',
        normalizedName: 'users',
        tableName: 'Users',
        baseSignature: signature,
      },
      state,
    );
  });

  it('重命名成功后应迁移草稿', async () => {
    const renameSavedTableDraft = vi.fn();
    const target = createSavedTableSummary('Users', 'users');

    const { result } = renderHook(() =>
      useSavedTableFlowActions({
        tableName: 'Users',
        hasLoadedTable: true,
        isLoadedDirty: true,
        canSaveCurrent: true,
        loadedTableNormalizedName: 'users',
        loadedTableName: 'Users',
        loadedTableSignature: JSON.stringify(createState('Users')),
        setLoadedTableNormalizedName: vi.fn(),
        setLoadedTableName: vi.fn(),
        setLoadedTableSignature: vi.fn(),
        setSavedTablesDrawerOpen: vi.fn(),
        saveDialog: createDialog({ name: 'Users', queuedLoadAfterSave: null }),
        loadConfirmDialog: createDialog({ pendingTarget: null }),
        renameDialog: createDialog({ name: 'Users New', target }),
        deleteDialog: createDialog({ target: null }),
        buildPersistedState: () => createState('Users'),
        serializePersistedState: (nextState) => JSON.stringify(nextState),
        applySavedState: vi.fn(),
        loadTable: vi.fn(),
        renameTable: vi
          .fn()
          .mockResolvedValue({ ok: true, normalizedName: 'users_new' }),
        deleteTable: vi.fn(),
        saveTable: vi.fn(),
        overwriteTable: vi.fn(),
        showToast: vi.fn(),
        trackEvent: vi.fn(),
        renameSavedTableDraft,
      }),
    );

    await act(async () => {
      await result.current.handleConfirmRename();
    });

    expect(renameSavedTableDraft).toHaveBeenCalledWith(
      'users',
      'users_new',
      'Users New',
    );
  });

  it('删除成功后应清理草稿', async () => {
    const removeSavedTableDraft = vi.fn();
    const target = createSavedTableSummary('Users', 'users');

    const { result } = renderHook(() =>
      useSavedTableFlowActions({
        tableName: 'Users',
        hasLoadedTable: true,
        isLoadedDirty: true,
        canSaveCurrent: true,
        loadedTableNormalizedName: 'users',
        loadedTableName: 'Users',
        loadedTableSignature: JSON.stringify(createState('Users')),
        setLoadedTableNormalizedName: vi.fn(),
        setLoadedTableName: vi.fn(),
        setLoadedTableSignature: vi.fn(),
        setSavedTablesDrawerOpen: vi.fn(),
        saveDialog: createDialog({ name: 'Users', queuedLoadAfterSave: null }),
        loadConfirmDialog: createDialog({ pendingTarget: null }),
        renameDialog: createDialog({ name: '', target: null }),
        deleteDialog: createDialog({ target }),
        buildPersistedState: () => createState('Users'),
        serializePersistedState: (nextState) => JSON.stringify(nextState),
        applySavedState: vi.fn(),
        loadTable: vi.fn(),
        renameTable: vi.fn(),
        deleteTable: vi
          .fn()
          .mockResolvedValue({ ok: true, normalizedName: 'users' }),
        saveTable: vi.fn(),
        overwriteTable: vi.fn(),
        showToast: vi.fn(),
        trackEvent: vi.fn(),
        removeSavedTableDraft,
      }),
    );

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(removeSavedTableDraft).toHaveBeenCalledWith('users');
  });
});
