import { useCallback } from 'react';

interface UseClearAllActionsParams {
  setIsClearDialogOpen: (open: boolean) => void;
  clearState: () => void;
  resetDocument: () => void;
}

export function useClearAllActions({
  setIsClearDialogOpen,
  clearState,
  resetDocument,
}: UseClearAllActionsParams) {
  const handleClearAll = useCallback(() => {
    setIsClearDialogOpen(true);
  }, [setIsClearDialogOpen]);

  const cancelClearAll = useCallback(() => {
    setIsClearDialogOpen(false);
  }, [setIsClearDialogOpen]);

  const confirmClearAll = useCallback(() => {
    resetDocument();
    clearState();
    cancelClearAll();
  }, [resetDocument, clearState, cancelClearAll]);

  return {
    handleClearAll,
    cancelClearAll,
    confirmClearAll,
  };
}
