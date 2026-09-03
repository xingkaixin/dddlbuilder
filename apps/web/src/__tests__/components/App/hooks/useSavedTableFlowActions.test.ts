import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { UseDialogStateReturn } from '@/hooks/useDialogState';
import { useSavedTableFlowActions } from '@/components/App/hooks/useSavedTableFlowActions';
import { buildSchemaStateSignature } from '@/utils/persistedStateSignature';

type SavedTableFlowParams = Parameters<typeof useSavedTableFlowActions>[0];
type DialogData<TDialog> = TDialog extends { data: infer TData } ? TData : never;
type SaveDialogData = DialogData<SavedTableFlowParams['saveDialog']>;
type RenameDialogData = DialogData<SavedTableFlowParams['renameDialog']>;
type DeleteDialogData = DialogData<SavedTableFlowParams['deleteDialog']>;
type SavedTableSummary = NonNullable<RenameDialogData['target']>;

const createState = (tableName: string): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 10,
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

const createSaveDialog = (data: SaveDialogData): SavedTableFlowParams['saveDialog'] =>
  createDialog(data);

const createRenameDialog = (data: RenameDialogData): SavedTableFlowParams['renameDialog'] =>
  createDialog(data);

const createDeleteDialog = (data: DeleteDialogData): SavedTableFlowParams['deleteDialog'] =>
  createDialog(data);

const createSavedTableSummary = (name: string, normalizedName: string): SavedTableSummary => ({
  tableId: `table-${normalizedName}`,
  name,
  normalizedName,
  dbType: 'mysql',
  fieldCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

describe('useSavedTableFlowActions', () => {
  it('首次保存成功后通知发起保存的调用方', async () => {
    const state = createState('Users');
    const saveDialog = createSaveDialog({
      name: 'Users',
    });

    const onSaveSuccess = vi.fn();

    const { result } = renderHook(() =>
      useSavedTableFlowActions({
        tableName: 'Users',
        hasLoadedTable: false,
        canSaveCurrent: true,
        loadedTableSource: null,
        setLoadedTableVersion: vi.fn(),
        countTableVersions: vi.fn().mockResolvedValue(1),
        createTableVersion: vi.fn().mockResolvedValue(undefined),
        saveDialog,
        renameDialog: createRenameDialog({ name: '', target: null }),
        deleteDialog: createDeleteDialog({ target: null }),
        buildPersistedState: () => state,
        loadTable: vi.fn(),
        renameTable: vi.fn(),
        deleteTable: vi.fn(),
        saveTable: vi.fn().mockResolvedValue({ ok: true, normalizedName: 'users' }),
        overwriteTable: vi.fn(),
        showToast: vi.fn(),
        onSaveSuccess,
      }),
    );

    await act(async () => {
      await result.current.handleConfirmSave();
    });

    const signature = buildSchemaStateSignature(state);
    expect(onSaveSuccess).toHaveBeenCalledWith({
      normalizedName: 'users',
      displayName: 'Users',
      baseSignature: signature,
      baseState: state,
      mode: 'create',
    });
  });

  it('重命名成功后应迁移草稿', async () => {
    const renameSavedTableDraft = vi.fn();
    const target = createSavedTableSummary('Users', 'users');

    const { result } = renderHook(() =>
      useSavedTableFlowActions({
        tableName: 'Users',
        hasLoadedTable: true,
        canSaveCurrent: true,
        loadedTableSource: {
          kind: 'saved_table',
          normalizedName: 'users',
          tableName: 'Users',
          baseSignature: JSON.stringify(createState('Users')),
        },
        setLoadedTableVersion: vi.fn(),
        countTableVersions: vi.fn().mockResolvedValue(1),
        createTableVersion: vi.fn().mockResolvedValue(undefined),
        saveDialog: createSaveDialog({ name: 'Users' }),
        renameDialog: createRenameDialog({ name: 'Users New', target }),
        deleteDialog: createDeleteDialog({ target: null }),
        buildPersistedState: () => createState('Users'),
        loadTable: vi.fn(),
        renameTable: vi.fn().mockResolvedValue({ ok: true, normalizedName: 'users_new' }),
        deleteTable: vi.fn(),
        saveTable: vi.fn(),
        overwriteTable: vi.fn(),
        showToast: vi.fn(),
        renameSavedTableDraft,
      }),
    );

    await act(async () => {
      await result.current.handleConfirmRename();
    });

    expect(renameSavedTableDraft).toHaveBeenCalledWith(
      expect.objectContaining({ normalizedName: 'users' }),
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
        canSaveCurrent: true,
        loadedTableSource: {
          kind: 'saved_table',
          normalizedName: 'users',
          tableName: 'Users',
          baseSignature: JSON.stringify(createState('Users')),
        },
        setLoadedTableVersion: vi.fn(),
        countTableVersions: vi.fn().mockResolvedValue(1),
        createTableVersion: vi.fn().mockResolvedValue(undefined),
        saveDialog: createSaveDialog({ name: 'Users' }),
        renameDialog: createRenameDialog({ name: '', target: null }),
        deleteDialog: createDeleteDialog({ target }),
        buildPersistedState: () => createState('Users'),
        loadTable: vi.fn(),
        renameTable: vi.fn(),
        deleteTable: vi.fn().mockResolvedValue({ ok: true, normalizedName: 'users' }),
        saveTable: vi.fn(),
        overwriteTable: vi.fn(),
        showToast: vi.fn(),
        removeSavedTableDraft,
      }),
    );

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(removeSavedTableDraft).toHaveBeenCalledWith(
      expect.objectContaining({ normalizedName: 'users' }),
    );
  });

  it('加载表时应合并保存版本与草稿而不修改编辑器', async () => {
    const target = createSavedTableSummary('Users', 'users');
    const savedState = createState('Users');
    const draftState = createState('UnsavedUsers');
    const onTableLoadStateChange = vi.fn();
    const loadTable = vi.fn().mockResolvedValue({
      normalizedName: 'users',
      name: 'Users',
      state: savedState,
    });

    const { result } = renderHook(() =>
      useSavedTableFlowActions({
        tableName: 'Users',
        hasLoadedTable: false,
        canSaveCurrent: true,
        loadedTableSource: null,
        setLoadedTableVersion: vi.fn(),
        countTableVersions: vi.fn().mockResolvedValue(1),
        createTableVersion: vi.fn().mockResolvedValue(undefined),
        saveDialog: createSaveDialog({ name: 'Users' }),
        renameDialog: createRenameDialog({ name: '', target: null }),
        deleteDialog: createDeleteDialog({ target: null }),
        buildPersistedState: () => createState('Users'),
        loadTable,
        renameTable: vi.fn(),
        deleteTable: vi.fn(),
        saveTable: vi.fn(),
        overwriteTable: vi.fn(),
        showToast: vi.fn(),
        getSavedTableDraft: () => ({
          state: draftState,
          tableName: 'Users',
          baseSignature: JSON.stringify(createState('OldUsers')),
          updatedAt: Date.now(),
        }),
        onTableLoadStateChange,
      }),
    );

    const snapshot = await act(async () => result.current.resolveSavedTable(target));

    expect(loadTable).toHaveBeenCalledWith(expect.objectContaining({ normalizedName: 'users' }));
    expect(snapshot?.state).toEqual(draftState);
    expect(onTableLoadStateChange).toHaveBeenNthCalledWith(1, true);
    expect(onTableLoadStateChange).toHaveBeenLastCalledWith(false);
  });

  it('加载表未命中时也应结束加载状态', async () => {
    const target = createSavedTableSummary('Users', 'users');
    const onTableLoadStateChange = vi.fn();
    const loadTable = vi.fn().mockResolvedValue(null);
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      useSavedTableFlowActions({
        tableName: 'Users',
        hasLoadedTable: false,
        canSaveCurrent: true,
        loadedTableSource: null,
        setLoadedTableVersion: vi.fn(),
        countTableVersions: vi.fn().mockResolvedValue(1),
        createTableVersion: vi.fn().mockResolvedValue(undefined),
        saveDialog: createSaveDialog({ name: 'Users' }),
        renameDialog: createRenameDialog({ name: '', target: null }),
        deleteDialog: createDeleteDialog({ target: null }),
        buildPersistedState: () => createState('Users'),
        loadTable,
        renameTable: vi.fn(),
        deleteTable: vi.fn(),
        saveTable: vi.fn(),
        overwriteTable: vi.fn(),
        showToast,
        onTableLoadStateChange,
      }),
    );

    await act(async () => {
      await result.current.resolveSavedTable(target);
    });

    expect(showToast).toHaveBeenCalledWith('未找到保存的表');
    expect(onTableLoadStateChange).toHaveBeenNthCalledWith(1, true);
    expect(onTableLoadStateChange).toHaveBeenLastCalledWith(false);
  });
});
