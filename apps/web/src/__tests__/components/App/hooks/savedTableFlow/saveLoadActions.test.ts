import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { type PersistedState, normalizePersistedRows } from '@ddlbuilder/shared-types';
import { useSaveLoadActions } from '@/components/App/hooks/savedTableFlow/saveLoadActions';
import { buildSchemaStateSignature } from '@/utils/persistedStateSignature';

vi.mock('@/utils/tableVersions', () => ({
  INITIAL_VERSION_MESSAGE_KEY: 'init',
}));

describe('useSaveLoadActions', () => {
  let saveDialog: any;
  let setLoadedTableVersion: any;
  let loadTable: any;
  let saveTable: any;
  let overwriteTable: any;
  let showToast: any;
  let onSaveSuccess: any;
  let onTableLoadStateChange: any;
  let buildPersistedState: any;
  let persistedState: PersistedState;
  let countTableVersions: any;
  let createTableVersion: any;

  beforeEach(() => {
    vi.clearAllMocks();
    saveDialog = {
      isOpen: false,
      data: { name: '' },
      openDialog: vi.fn().mockImplementation((d: any) => {
        saveDialog.data = d;
      }),
      closeDialog: vi.fn(),
      setError: vi.fn(),
    };
    setLoadedTableVersion = vi.fn();
    loadTable = vi.fn();
    saveTable = vi.fn();
    overwriteTable = vi.fn();
    showToast = vi.fn();
    onSaveSuccess = vi.fn();
    onTableLoadStateChange = vi.fn();
    persistedState = {
      schemaName: '',
      tableName: 'test',
      tableComment: '',
      dbType: 'mysql',
      sqlFormatMode: 'compact',
      rows: [],
      addCount: 10,
      indexes: [],
      authInput: '',
      authObjects: [],
    };
    buildPersistedState = vi.fn().mockReturnValue(persistedState);
    countTableVersions = vi.fn().mockResolvedValue(1);
    createTableVersion = vi.fn().mockResolvedValue(undefined);
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
        loadTable,
        saveTable,
        overwriteTable,
        countTableVersions,
        createTableVersion,
        showToast,
        onSaveSuccess,
        onTableLoadStateChange,
        ...overrides,
      }),
    );

  it('resolveSavedTable handles not found', async () => {
    loadTable.mockResolvedValue(null);
    const { result } = getHook();

    await act(async () => {
      await result.current.resolveSavedTable({
        normalizedName: 'missing',
      } as any);
    });

    expect(showToast).toHaveBeenCalledWith('未找到保存的表');
  });

  it('resolveSavedTable handles load error', async () => {
    loadTable.mockRejectedValue(new Error('Load failed'));
    const { result } = getHook();

    await act(async () => {
      await result.current.resolveSavedTable({
        normalizedName: 'error_table',
      } as any);
    });

    expect(showToast).toHaveBeenCalledWith('Load failed');
    expect(onTableLoadStateChange).toHaveBeenCalledWith(false);
  });

  it('resolveSavedTable returns resolved state and version', async () => {
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

    let snapshot: Awaited<ReturnType<typeof result.current.resolveSavedTable>> = null;
    await act(async () => {
      snapshot = await result.current.resolveSavedTable(mockRecord as any);
    });

    expect(onTableLoadStateChange).toHaveBeenCalledWith(true);
    expect(snapshot).toMatchObject({
      source: { normalizedName: 'norm_test', tableName: 'test_table' },
      version: 1,
    });
    expect(onTableLoadStateChange).toHaveBeenCalledWith(false);
  });

  it('resolveSavedTable restores matching saved-table draft', async () => {
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

    let snapshot: Awaited<ReturnType<typeof result.current.resolveSavedTable>> = null;
    await act(async () => {
      snapshot = await result.current.resolveSavedTable({
        normalizedName: 'norm_test',
        name: 'test_table',
      } as any);
    });

    expect(snapshot).toEqual({
      source: {
        kind: 'saved_table',
        normalizedName: 'norm_test',
        tableName: 'test_table',
        baseSignature: buildSchemaStateSignature(
          normalizePersistedRows(savedState as PersistedState),
        ),
      },
      state: draftState,
      version: 1,
    });
  });

  it('resolveSavedTable 只解析目标标签数据，不修改当前编辑器', async () => {
    const savedState = {
      ...persistedState,
      tableName: 'background',
      rows: [],
    } satisfies PersistedState;
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

      const snapshot = await act(() =>
        result.current.resolveSavedTable({ normalizedName: 'orders' } as any),
      );

      expect(snapshot?.state).toBe(draftState);
    });

    it('基线确实变化时仍回落到已保存版本', async () => {
      const draftState = { ...normalizePersistedRows(legacySavedState) } as PersistedState;
      const staleBase = JSON.stringify({
        ...legacySavedState,
        rows: [{ ...legacySavedState.rows[0], fieldType: 'int' }],
      });
      const { result } = loadWithDraft(draftState, staleBase);

      const snapshot = await act(() =>
        result.current.resolveSavedTable({ normalizedName: 'orders' } as any),
      );

      expect(snapshot?.state).toEqual(normalizePersistedRows(legacySavedState));
    });
  });

  it('handleOpenSaveDialog fallback name uses defaults', () => {
    const { result } = getHook({ tableName: ' ' });
    act(() => {
      result.current.handleOpenSaveDialog();
    });
    expect(saveDialog.openDialog).toHaveBeenCalledWith({
      name: '未命名表',
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
    };
    overwriteTable.mockResolvedValue({ ok: true, normalizedName: 'norm' });

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

    expect(showToast).toHaveBeenCalledWith('已更新：orig_name');
    expect(saveDialog.closeDialog).toHaveBeenCalled();
    expect(onSaveSuccess).toHaveBeenCalledWith({
      normalizedName: 'norm',
      displayName: 'orig_name',
      baseSignature: buildSchemaStateSignature(persistedState),
      baseState: persistedState,
      mode: 'update',
    });
    expect(loadTable).not.toHaveBeenCalled();
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
      sourceDraftId: 'active-draft-id',
    });
    await act(async () => {
      await result.current.handleConfirmSave();
    });

    expect(showToast).toHaveBeenCalledWith('已保存：new_name');
    expect(saveTable).toHaveBeenCalledWith('   new_name   ', persistedState, 'active-draft-id');
    expect(setLoadedTableVersion).toHaveBeenCalledWith(1, {
      normalizedName: 'new_norm',
      tableId: undefined,
    });
    expect(saveDialog.closeDialog).toHaveBeenCalled();
    expect(onSaveSuccess).toHaveBeenCalledWith({
      normalizedName: 'new_norm',
      displayName: 'new_name',
      baseSignature: buildSchemaStateSignature(persistedState),
      baseState: persistedState,
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
