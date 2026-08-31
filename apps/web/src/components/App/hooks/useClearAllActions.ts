import { useCallback } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useEditorStore } from '@/stores/editorStore';
import { toPersistedState } from '@/stores/editorDocumentCodec';

interface UseClearAllActionsParams {
  setIsClearDialogOpen: (open: boolean) => void;
  clearState: (state: PersistedState) => void;
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
    clearState(toPersistedState(useEditorStore.getState()));
    cancelClearAll();
  }, [resetDocument, clearState, cancelClearAll]);

  return {
    handleClearAll,
    cancelClearAll,
    confirmClearAll,
  };
}
