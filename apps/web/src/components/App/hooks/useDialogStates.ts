import { useCallback } from 'react';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { useDialogState } from '@/hooks/useDialogState';

/**
 * 聚合 App 组件中所有 dialog state 的初始化。
 * 从 App/index.tsx 中提取，减少主组件的样板代码。
 */
export function useDialogStates(deps: {
  isSaveDialogOpen: boolean;
  setIsSaveDialogOpen: (open: boolean) => void;
  isRenameDialogOpen: boolean;
  setIsRenameDialogOpen: (open: boolean) => void;
  isDeleteDialogOpen: boolean;
  setIsDeleteDialogOpen: (open: boolean) => void;
}) {
  const saveDialog = useDialogState<{
    name: string;
  }>({
    open: deps.isSaveDialogOpen,
    setOpen: deps.setIsSaveDialogOpen,
    initialData: {
      name: '',
    },
  });

  const renameDialog = useDialogState<{
    name: string;
    target: SavedTableSummary | null;
  }>({
    open: deps.isRenameDialogOpen,
    setOpen: deps.setIsRenameDialogOpen,
    initialData: {
      name: '',
      target: null,
    },
  });

  const deleteDialog = useDialogState<{
    target: SavedTableSummary | null;
  }>({
    open: deps.isDeleteDialogOpen,
    setOpen: deps.setIsDeleteDialogOpen,
    initialData: {
      target: null,
    },
  });

  const saveName = saveDialog.data.name;
  const saveError = saveDialog.error;
  const renameName = renameDialog.data.name;
  const renameError = renameDialog.error;
  const deleteTarget = deleteDialog.data.target;
  const handleSaveNameChange = useCallback(
    (value: string) => {
      saveDialog.updateData((previous) => ({ ...previous, name: value }));
      if (saveDialog.error) saveDialog.clearError();
    },
    [saveDialog],
  );
  const handleRenameNameChange = useCallback(
    (value: string) => {
      renameDialog.updateData((previous) => ({ ...previous, name: value }));
      if (renameDialog.error) renameDialog.clearError();
    },
    [renameDialog],
  );

  return {
    saveDialog,
    renameDialog,
    deleteDialog,
    saveName,
    saveError,
    renameName,
    renameError,
    deleteTarget,
    handleSaveNameChange,
    handleRenameNameChange,
  };
}
