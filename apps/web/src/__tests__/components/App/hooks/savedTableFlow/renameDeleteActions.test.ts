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
});
