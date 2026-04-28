import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useSaveLoadActions } from '@/components/App/hooks/savedTableFlow/saveLoadActions';

// Mocks for DB utils so we don't depend on indexedDB environment in these unit tests
vi.mock('@/utils/tableVersions', () => ({
  createVersion: vi.fn(),
  countVersions: vi.fn().mockResolvedValue(1),
  INITIAL_VERSION_MESSAGE_KEY: 'init',
}));

describe('useSaveLoadActions', () => {
  let saveDialog: any;
  let setLoadedTableNormalizedName: any;
  let setLoadedTableName: any;
  let setLoadedTableSignature: any;
  let setLoadedTableVersion: any;
  let setSavedTablesDrawerOpen: any;
  let applySavedState: any;
  let loadTable: any;
  let saveTable: any;
  let overwriteTable: any;
  let showToast: any;
  let trackEvent: any;
  let flushCurrentWorkspace: any;
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
    setLoadedTableNormalizedName = vi.fn();
    setLoadedTableName = vi.fn();
    setLoadedTableSignature = vi.fn();
    setLoadedTableVersion = vi.fn();
    setSavedTablesDrawerOpen = vi.fn();
    applySavedState = vi.fn();
    loadTable = vi.fn();
    saveTable = vi.fn();
    overwriteTable = vi.fn();
    showToast = vi.fn();
    trackEvent = vi.fn().mockResolvedValue(undefined);
    flushCurrentWorkspace = vi.fn();
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
        loadedTableNormalizedName: null,
        loadedTableName: null,
        setLoadedTableNormalizedName,
        setLoadedTableName,
        setLoadedTableSignature,
        setLoadedTableVersion,
        setSavedTablesDrawerOpen,
        saveDialog,
        buildPersistedState,
        serializePersistedState,
        applySavedState,
        loadTable,
        saveTable,
        overwriteTable,
        showToast,
        trackEvent,
        flushCurrentWorkspace,
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
      // It is not exposed directly, but can be triggered by handleSelectSavedTable if not dirty
      result.current.handleSelectSavedTable({
        normalizedName: 'missing',
      } as any);
    });

    expect(showToast).toHaveBeenCalledWith('未找到保存的表');
  });

  it('handleLoadSavedTable handles load error', async () => {
    loadTable.mockRejectedValue(new Error('Load failed'));
    const { result } = getHook();

    await act(async () => {
      result.current.handleSelectSavedTable({
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
      result.current.handleSelectSavedTable(mockRecord as any);
    });

    expect(onTableLoadStateChange).toHaveBeenCalledWith(true);
    expect(setWorkspaceSnapshot).toHaveBeenCalled();
    expect(applySavedState).toHaveBeenCalledWith(mockRecord.state);
    expect(setLoadedTableNormalizedName).toHaveBeenCalledWith('norm_test');
    expect(setLoadedTableName).toHaveBeenCalledWith('test_table');
    expect(setLoadedTableSignature).toHaveBeenCalledWith('mock-sig');
    expect(trackEvent).toHaveBeenCalledWith('table_load', {
      tableName: 'test_table',
    });
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('已加载：test_table'));
    expect(onTableLoadStateChange).toHaveBeenCalledWith(false);
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
      loadedTableNormalizedName: 'norm',
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
      loadedTableNormalizedName: 'norm',
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
      loadedTableNormalizedName: 'norm',
      loadedTableName: 'orig_name',
    });

    await act(async () => {
      await result.current.handleConfirmSave();
    });

    expect(setLoadedTableSignature).toHaveBeenCalledWith('mock-sig');
    expect(setWorkspaceSnapshot).toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith('table_update', {
      tableName: 'orig_name',
    });
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

    expect(setLoadedTableNormalizedName).toHaveBeenCalledWith('new_norm');
    expect(setLoadedTableName).toHaveBeenCalledWith('new_name');
    expect(setLoadedTableSignature).toHaveBeenCalledWith('mock-sig');
    expect(setWorkspaceSnapshot).toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith('table_save', {
      tableName: 'new_name',
    });
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

  it('handleSelectSavedTable asks to save dirty loaded table before loading target', async () => {
    const target = { normalizedName: 'pending_norm', name: 'pending' };
    loadTable.mockResolvedValue({
      normalizedName: 'pending_norm',
      name: 'pending',
      state: { rows: [] },
    });

    const { result } = getHook({ hasLoadedTable: true });

    await act(async () => {
      result.current.handleSelectSavedTable(target as any);
    });

    expect(flushCurrentWorkspace).toHaveBeenCalled();
    expect(setSavedTablesDrawerOpen).toHaveBeenCalledWith(false);
    expect(saveDialog.openDialog).toHaveBeenCalledWith({
      name: 'default_name',
      queuedLoadAfterSave: target,
    });
    expect(loadTable).not.toHaveBeenCalled();
  });
});
