import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useRenameDeleteActions } from '@/components/App/hooks/savedTableFlow/renameDeleteActions';

describe('useRenameDeleteActions', () => {
  let renameDialog: any;
  let deleteDialog: any;
  let renameTable: any;
  let deleteTable: any;
  let showToast: any;
  let onTabRename: any;
  let renameSavedTableDraft: any;
  let removeSavedTableDraft: any;

  beforeEach(() => {
    renameDialog = {
      isOpen: false,
      data: { name: '', target: null },
      error: null,
      openDialog: vi.fn().mockImplementation((d: any) => {
        renameDialog.data = d;
      }),
      closeDialog: vi.fn(),
      setError: vi.fn(),
    };
    deleteDialog = {
      isOpen: false,
      data: { target: null },
      error: null,
      openDialog: vi.fn().mockImplementation((d: any) => {
        deleteDialog.data = d;
      }),
      closeDialog: vi.fn(),
      setError: vi.fn(),
    };
    renameTable = vi.fn();
    deleteTable = vi.fn();
    showToast = vi.fn();
    onTabRename = vi.fn();
    renameSavedTableDraft = vi.fn();
    removeSavedTableDraft = vi.fn();
  });

  const getHook = (overrides = {}) =>
    renderHook(() =>
      useRenameDeleteActions({
        renameDialog,
        deleteDialog,
        renameTable,
        deleteTable,
        showToast,
        onTabRename,
        renameSavedTableDraft,
        removeSavedTableDraft,
        ...overrides,
      }),
    );

  it('handleOpenRenameDialog sets dialog data', () => {
    const { result } = getHook();
    act(() => {
      result.current.handleOpenRenameDialog({
        name: 'old',
        normalizedName: 'old_norm',
        updatedAt: 0,
        preview: '',
      });
    });
    expect(renameDialog.openDialog).toHaveBeenCalledWith({
      name: 'old',
      target: {
        name: 'old',
        normalizedName: 'old_norm',
        updatedAt: 0,
        preview: '',
      },
    });
  });

  it('handleRenameDialogOpenChange closes dialog on false', () => {
    const { result } = getHook();
    act(() => {
      result.current.handleRenameDialogOpenChange(false);
    });
    expect(renameDialog.closeDialog).toHaveBeenCalled();
  });

  it('handleRenameDialogOpenChange does nothing on true', () => {
    const { result } = getHook();
    act(() => {
      result.current.handleRenameDialogOpenChange(true);
    });
    expect(renameDialog.closeDialog).not.toHaveBeenCalled();
  });

  it('handleConfirmRename early returns if no target', async () => {
    const { result } = getHook();
    await act(async () => {
      await result.current.handleConfirmRename();
    });
    expect(renameTable).not.toHaveBeenCalled();
  });

  it('handleConfirmRename handles duplicate error', async () => {
    renameDialog.data = {
      name: 'new_name',
      target: { normalizedName: 'old_norm' },
    };
    renameTable.mockResolvedValue({ ok: false, reason: 'duplicate' });
    const { result } = getHook();

    await act(async () => {
      await result.current.handleConfirmRename();
    });

    expect(renameDialog.setError).toHaveBeenCalledWith('名称已存在，请换一个');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('handleConfirmRename handles arbitrary rename failure', async () => {
    renameDialog.data = {
      name: 'new_name',
      target: { normalizedName: 'old_norm' },
    };
    renameTable.mockResolvedValue({ ok: false });
    const { result } = getHook();

    await act(async () => {
      await result.current.handleConfirmRename();
    });

    expect(showToast).toHaveBeenCalledWith('重命名失败');
  });

  it('handleConfirmRename handles explicit rename error message', async () => {
    renameDialog.data = {
      name: 'new_name',
      target: { normalizedName: 'old_norm' },
    };
    renameTable.mockResolvedValue({ ok: false, message: 'Custom fallback' });
    const { result } = getHook();

    await act(async () => {
      await result.current.handleConfirmRename();
    });

    expect(showToast).toHaveBeenCalledWith('Custom fallback');
  });

  it('handleConfirmRename updates the draft and delegates tab renaming', async () => {
    renameDialog.data = {
      name: '  new_name  ',
      target: { name: 'old', normalizedName: 'test_table' },
    };
    renameTable.mockResolvedValue({
      ok: true,
      normalizedName: 'new_name_norm',
    });
    const { result } = getHook();

    await act(async () => {
      await result.current.handleConfirmRename();
    });

    expect(showToast).toHaveBeenCalledWith('已重命名为：new_name');
    expect(renameSavedTableDraft).toHaveBeenCalledWith(
      renameDialog.data.target,
      'new_name_norm',
      'new_name',
    );

    expect(onTabRename).toHaveBeenCalledWith(renameDialog.data.target, 'new_name_norm', 'new_name');
    expect(renameDialog.closeDialog).toHaveBeenCalled();
  });

  it('handleConfirmRename successfully updates name using DEFAULT if blank', async () => {
    renameDialog.data = {
      name: '    ',
      target: { name: 'old', normalizedName: 'other_table' },
    };
    renameTable.mockResolvedValue({
      ok: true,
      normalizedName: 'new_name_norm',
    });
    const { result } = getHook();

    await act(async () => {
      await result.current.handleConfirmRename();
    });

    expect(showToast).toHaveBeenCalledWith('已重命名为：未命名表');
  });

  it('handleOpenDeleteDialog sets delete dialog data', () => {
    const { result } = getHook();
    act(() => {
      result.current.handleOpenDeleteDialog({
        name: 'old',
        normalizedName: 'old_norm',
        updatedAt: 0,
        preview: '',
      });
    });
    expect(deleteDialog.openDialog).toHaveBeenCalledWith({
      target: {
        name: 'old',
        normalizedName: 'old_norm',
        updatedAt: 0,
        preview: '',
      },
    });
  });

  it('handleDeleteDialogOpenChange closes dialog on false', () => {
    const { result } = getHook();
    act(() => {
      result.current.handleDeleteDialogOpenChange(false);
    });
    expect(deleteDialog.closeDialog).toHaveBeenCalled();
  });

  it('handleDeleteDialogOpenChange does nothing on true', () => {
    const { result } = getHook();
    act(() => {
      result.current.handleDeleteDialogOpenChange(true);
    });
    expect(deleteDialog.closeDialog).not.toHaveBeenCalled();
  });

  it('handleConfirmDelete early returns without target', async () => {
    const { result } = getHook();
    await act(async () => {
      await result.current.handleConfirmDelete();
    });
    expect(deleteTable).not.toHaveBeenCalled();
  });

  it('handleConfirmDelete handles failure with generic message', async () => {
    deleteDialog.data = { target: { normalizedName: 'old_norm' } };
    deleteTable.mockResolvedValue({ ok: false });
    const { result } = getHook();

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(showToast).toHaveBeenCalledWith('删除失败');
  });

  it('handleConfirmDelete handles failure with specific message', async () => {
    deleteDialog.data = { target: { normalizedName: 'old_norm' } };
    deleteTable.mockResolvedValue({
      ok: false,
      message: 'Custom delete error',
    });
    const { result } = getHook();

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(showToast).toHaveBeenCalledWith('Custom delete error');
  });

  it('handleConfirmDelete delegates loaded table removal without writing stale editor state', async () => {
    deleteDialog.data = {
      target: { name: 'old', normalizedName: 'test_table' },
    };
    deleteTable.mockResolvedValue({ ok: true });
    const { result } = getHook();

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(removeSavedTableDraft).toHaveBeenCalledWith(deleteDialog.data.target);
    expect(showToast).toHaveBeenCalledWith('已移入回收站：old');
    expect(deleteDialog.closeDialog).toHaveBeenCalled();
  });

  it('handleConfirmDelete success NOT matching loaded table does not reset global state', async () => {
    deleteDialog.data = {
      target: { name: 'old', normalizedName: 'other_table' },
    };
    deleteTable.mockResolvedValue({ ok: true });
    const { result } = getHook();

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(removeSavedTableDraft).toHaveBeenCalledWith(deleteDialog.data.target);
    expect(deleteDialog.closeDialog).toHaveBeenCalled();
  });
});
