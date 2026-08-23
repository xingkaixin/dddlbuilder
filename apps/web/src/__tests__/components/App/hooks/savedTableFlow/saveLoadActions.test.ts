import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { type PersistedState, normalizePersistedRows } from '@ddlbuilder/shared-types';
import { useSaveLoadActions } from '@/components/App/hooks/savedTableFlow/saveLoadActions';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';

// Mocks for DB utils so we don't depend on indexedDB environment in these unit tests
vi.mock('@/utils/tableVersions', () => ({
  createVersion: vi.fn(),
  countVersions: vi.fn().mockResolvedValue(1),
  INITIAL_VERSION_MESSAGE_KEY: 'init',
}));

describe('useSaveLoadActions', () => {
  let saveDialog: any;
  let setLoadedTableVersion: any;
  let applySavedState: any;
  let loadTable: any;
  let saveTable: any;
  let overwriteTable: any;
  let showToast: any;
  let setWorkspaceSnapshot: any;
  let onSaveSuccess: any;
  let onTableLoadStateChange: any;
  let buildPersistedState: any;
  let serializePersistedState: any;

  beforeEach(() => {
    vi.clearAllMocks();
    saveDialog = {
      isOpen: false,
      data: { name: '', queuedLoadAfterSave: null },
      openDialog: vi.fn().mockImplementation((d: any) => {
        saveDialog.data = d;
      }),
      closeDialog: vi.fn(),
      setError: vi.fn(),
    };
    setLoadedTableVersion = vi.fn();
    applySavedState = vi.fn();
    loadTable = vi.fn();
    saveTable = vi.fn();
    overwriteTable = vi.fn();
    showToast = vi.fn();
    setWorkspaceSnapshot = vi.fn();
    onSaveSuccess = vi.fn();
    onTableLoadStateChange = vi.fn();
    buildPersistedState = vi.fn().mockReturnValue({ test: 1 });
    serializePersistedState = vi.fn().mockReturnValue('mock-sig');
  });

  const getHook = (overrides = {}) =>
    renderHook(() =>
      useSaveLoadActions({
        tableName: 'default_name',
        hasLoadedTable: false,
        canSaveCurrent: true,
        loadedTableSource: null,
        setLoadedTableVersion,
        saveDialog,
        buildPersistedState,
        serializePersistedState,
        applySavedState,
        loadTable,
        saveTable,
        overwriteTable,
        showToast,
        setWorkspaceSnapshot,
        onSaveSuccess,
        onTableLoadStateChange,
        ...overrides,
      }),
    );

  it('handleLoadSavedTable handles not found', async () => {
    loadTable.mockResolvedValue(null);
    const { result } = getHook();

    await act(async () => {
      result.current.handleLoadSavedTable({
        normalizedName: 'missing',
      } as any);
    });

    expect(showToast).toHaveBeenCalledWith('未找到保存的表');
  });

  it('handleLoadSavedTable handles load error', async () => {
    loadTable.mockRejectedValue(new Error('Load failed'));
    const { result } = getHook();

    await act(async () => {
      result.current.handleLoadSavedTable({
        normalizedName: 'error_table',
      } as any);
    });

    expect(showToast).toHaveBeenCalledWith('Load failed');
    expect(onTableLoadStateChange).toHaveBeenCalledWith(false);
  });

  it('handleLoadSavedTable success sets states appropriately', async () => {
    const mockRecord = {
      normalizedName: 'norm_test',
      name: 'test_table',
      state: {
        tableName: 'test_table',
        dbType: 'mysql',
        rows: [{ fieldName: 'id' }, { fieldName: '  ' }],
      },
    };
    loadTable.mockResolvedValue(mockRecord);
    const { result } = getHook();

    await act(async () => {
      result.current.handleLoadSavedTable(mockRecord as any);
    });

    expect(onTableLoadStateChange).toHaveBeenCalledWith(true);
    expect(setWorkspaceSnapshot).toHaveBeenCalled();
    expect(applySavedState).toHaveBeenCalledWith(mockRecord.state);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('已加载：test_table'));
    expect(onTableLoadStateChange).toHaveBeenCalledWith(false);
  });

  it('handleLoadSavedTable restores matching saved-table draft', async () => {
    const savedState = {
      tableName: 'test_table',
      dbType: 'mysql',
      rows: [{ fieldName: 'id' }],
    };
    const draftState = {
      ...savedState,
      tableName: 'test_table_draft',
    };
    loadTable.mockResolvedValue({
      normalizedName: 'norm_test',
      name: 'test_table',
      state: normalizePersistedRows(savedState as PersistedState),
    });

    const { result } = getHook({
      getSavedTableDraft: vi.fn().mockReturnValue({
        state: draftState,
        tableName: 'test_table',
        baseSignature: JSON.stringify(savedState),
        updatedAt: Date.now(),
      }),
    });

    await act(async () => {
      result.current.handleLoadSavedTable({
        normalizedName: 'norm_test',
        name: 'test_table',
      } as any);
    });

    expect(applySavedState).toHaveBeenCalledWith(draftState);
    expect(setWorkspaceSnapshot).toHaveBeenCalledWith(
      {
        kind: 'saved_table',
        normalizedName: 'norm_test',
        tableName: 'test_table',
        baseSignature: serializePersistedStateForComparison(
          normalizePersistedRows(savedState as PersistedState),
        ),
      },
      draftState,
    );
  });

  it('resolveSavedTable 只解析目标标签数据，不修改当前编辑器', async () => {
    const savedState = {
      tableName: 'background',
      dbType: 'mysql',
      rows: [],
    } as PersistedState;
    loadTable.mockResolvedValue({
      normalizedName: 'background',
      name: 'Background',
      state: savedState,
    });
    const { result } = getHook();

    const snapshot = await act(() =>
      result.current.resolveSavedTable({ normalizedName: 'background' } as any),
    );

    expect(snapshot).toMatchObject({
      source: { normalizedName: 'background', tableName: 'Background' },
      state: savedState,
    });
    expect(setWorkspaceSnapshot).not.toHaveBeenCalled();
    expect(applySavedState).not.toHaveBeenCalled();
    expect(setLoadedTableVersion).not.toHaveBeenCalled();
  });

  describe('跨版本升级后的已保存表草稿', () => {
    const legacySavedState = {
      tableName: 'orders',
      dbType: 'mysql',
      rows: [
        {
          order: 1,
          fieldName: 'id',
          fieldType: 'bigint',
          fieldComment: '主键',
          nullable: '否',
          defaultKind: '自增',
          defaultValue: '',
          onUpdate: '无',
        },
      ],
    } as unknown as PersistedState;

    // 升级后已保存表经 savedTablesDb 读取入口归一化，baseSignature 仍是迁移前写入的原始 JSON
    const loadWithDraft = (draftState: PersistedState, baseSignature: string) => {
      const recordState = normalizePersistedRows(legacySavedState);
      loadTable.mockResolvedValue({
        normalizedName: 'orders',
        name: 'orders',
        state: recordState,
      });

      return getHook({
        serializePersistedState: serializePersistedStateForComparison,
        getSavedTableDraft: vi.fn().mockReturnValue({
          state: draftState,
          tableName: 'orders',
          baseSignature,
          updatedAt: Date.now(),
        }),
      });
    };

    it('保留未保存的编辑，而不是回落到已保存版本', async () => {
      const draftState = {
        ...normalizePersistedRows(legacySavedState),
        tableComment: '尚未保存的编辑',
      } as PersistedState;
      const { result } = loadWithDraft(draftState, JSON.stringify(legacySavedState));

      await act(async () => {
        result.current.handleLoadSavedTable({ normalizedName: 'orders' } as any);
      });

      expect(applySavedState).toHaveBeenCalledWith(draftState);
    });

    it('基线确实变化时仍回落到已保存版本', async () => {
      const draftState = { ...normalizePersistedRows(legacySavedState) } as PersistedState;
      const staleBase = JSON.stringify({
        ...legacySavedState,
        rows: [{ ...legacySavedState.rows[0], fieldType: 'int' }],
      });
      const { result } = loadWithDraft(draftState, staleBase);

      await act(async () => {
        result.current.handleLoadSavedTable({ normalizedName: 'orders' } as any);
      });

      expect(applySavedState).toHaveBeenCalledWith(normalizePersistedRows(legacySavedState));
    });
  });

  it('handleOpenSaveDialog fallback name uses defaults', () => {
    const { result } = getHook({ tableName: ' ' });
    act(() => {
      result.current.handleOpenSaveDialog();
    });
    expect(saveDialog.openDialog).toHaveBeenCalledWith({
      name: '未命名表',
      queuedLoadAfterSave: null,
    });
  });

  it('handleConfirmSave returns early if !canSaveCurrent', async () => {
    const { result } = getHook({ canSaveCurrent: false });
    await act(async () => {
      await result.current.handleConfirmSave();
    });
    expect(showToast).toHaveBeenCalledWith('加载的表未修改，无法保存');
    expect(saveTable).not.toHaveBeenCalled();
    expect(overwriteTable).not.toHaveBeenCalled();
  });

  it('handleConfirmSave handles overwriteTable not found error', async () => {
    overwriteTable.mockResolvedValue({ ok: false, reason: 'not_found' });
    const { result } = getHook({
      hasLoadedTable: true,
      loadedTableSource: {
        kind: 'saved_table',
        normalizedName: 'norm',
        tableName: 'orig_name',
        baseSignature: 'old-sig',
      },
    });
    await act(async () => {
      await result.current.handleConfirmSave();
    });
    expect(showToast).toHaveBeenCalledWith('未找到保存的表');
  });

  it('handleConfirmSave handles overwriteTable arbitrary error', async () => {
    overwriteTable.mockResolvedValue({
      ok: false,
      message: 'Custom update error',
    });
    const { result } = getHook({
      hasLoadedTable: true,
      loadedTableSource: {
        kind: 'saved_table',
        normalizedName: 'norm',
        tableName: 'orig_name',
        baseSignature: 'old-sig',
      },
    });
    await act(async () => {
      await result.current.handleConfirmSave();
    });
    expect(showToast).toHaveBeenCalledWith('Custom update error');
  });

  it('handleConfirmSave handles overwriteTable success with exact states mapped', async () => {
    saveDialog.data = {
      name: 'saved_name',
      queuedLoadAfterSave: { normalizedName: 'queue_1' },
    };
    overwriteTable.mockResolvedValue({ ok: true });

    // We mock the loadTable so queuedLoadAfterSave works cleanly
    loadTable.mockResolvedValue({
      normalizedName: 'queue_1',
      name: 'queue_table',
      state: { rows: [] },
    });

    const { result } = getHook({
      hasLoadedTable: true,
      loadedTableSource: {
        kind: 'saved_table',
        normalizedName: 'norm',
        tableName: 'orig_name',
        baseSignature: 'old-sig',
      },
    });

    await act(async () => {
      await result.current.handleConfirmSave();
    });

    expect(setWorkspaceSnapshot).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('已更新：orig_name');
    expect(saveDialog.closeDialog).toHaveBeenCalled();
    expect(onSaveSuccess).toHaveBeenCalledWith({
      normalizedName: 'norm',
      displayName: 'orig_name',
      baseSignature: 'mock-sig',
      mode: 'update',
    });
    // We expect it to run handleLoadSavedTable after success
    expect(loadTable).toHaveBeenCalledWith('queue_1');
  });

  it('handleConfirmSave handles saveTable duplicate error', async () => {
    saveTable.mockResolvedValue({ ok: false, reason: 'duplicate' });
    saveDialog.data = { name: 'dup_name' };
    const { result } = getHook({
      hasLoadedTable: false,
    });
    await act(async () => {
      await result.current.handleConfirmSave();
    });
    expect(saveDialog.setError).toHaveBeenCalledWith('名称已存在，请换一个');
  });

  it('handleConfirmSave handles saveTable arbitrary error', async () => {
    saveTable.mockResolvedValue({ ok: false });
    saveDialog.data = { name: 'dup_name' };
    const { result } = getHook({
      hasLoadedTable: false,
    });
    await act(async () => {
      await result.current.handleConfirmSave();
    });
    expect(showToast).toHaveBeenCalledWith('保存失败');
  });

  it('handleConfirmSave handles saveTable success', async () => {
    saveTable.mockResolvedValue({ ok: true, normalizedName: 'new_norm' });
    saveDialog.data = { name: '   new_name   ' }; // Should trim
    const { result } = getHook({
      hasLoadedTable: false,
    });
    await act(async () => {
      await result.current.handleConfirmSave();
    });

    expect(setWorkspaceSnapshot).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('已保存：new_name');
    expect(setLoadedTableVersion).toHaveBeenCalledWith(1);
    expect(saveDialog.closeDialog).toHaveBeenCalled();
    expect(onSaveSuccess).toHaveBeenCalledWith({
      normalizedName: 'new_norm',
      displayName: 'new_name',
      baseSignature: 'mock-sig',
      mode: 'create',
    });
  });

  it('handleSaveDialogOpenChange closes dialog only on close request', () => {
    const { result } = getHook();

    act(() => {
      result.current.handleSaveDialogOpenChange(false);
    });
    expect(saveDialog.closeDialog).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleSaveDialogOpenChange(true);
    });
    expect(saveDialog.closeDialog).toHaveBeenCalledTimes(1);
  });
});
