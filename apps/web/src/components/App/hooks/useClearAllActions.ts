import { useCallback } from 'react';

interface UseClearAllActionsParams {
  setIsClearDialogOpen: (open: boolean) => void;
  clearState: () => void;
  resetTableConfig: () => void;
  resetTableViewConfig: () => void;
  resetTableRows: () => void;
  resetIndexState: () => void;
  resetAuthState: () => void;
  resetCitusSharding: () => void;
  resetPartition: () => void;
  resetTableMiscConfig: () => void;
  setLoadedTableNormalizedName: (name: string | null) => void;
  setLoadedTableName: (name: string | null) => void;
  setLoadedTableSignature: (signature: string | null) => void;
}

export function useClearAllActions({
  setIsClearDialogOpen,
  clearState,
  resetTableConfig,
  resetTableViewConfig,
  resetTableRows,
  resetIndexState,
  resetAuthState,
  resetCitusSharding,
  resetPartition,
  resetTableMiscConfig,
  setLoadedTableNormalizedName,
  setLoadedTableName,
  setLoadedTableSignature,
}: UseClearAllActionsParams) {
  const handleClearAll = useCallback(() => {
    setIsClearDialogOpen(true);
  }, [setIsClearDialogOpen]);

  const cancelClearAll = useCallback(() => {
    setIsClearDialogOpen(false);
  }, [setIsClearDialogOpen]);

  const confirmClearAll = useCallback(() => {
    resetTableConfig();
    resetTableViewConfig();
    resetTableRows();
    resetIndexState();
    resetAuthState();
    resetCitusSharding();
    resetPartition();
    resetTableMiscConfig();
    setLoadedTableNormalizedName(null);
    setLoadedTableName(null);
    setLoadedTableSignature(null);

    clearState();
    cancelClearAll();
  }, [
    resetTableConfig,
    resetTableViewConfig,
    resetTableRows,
    resetIndexState,
    resetAuthState,
    resetCitusSharding,
    resetPartition,
    resetTableMiscConfig,
    setLoadedTableNormalizedName,
    setLoadedTableName,
    setLoadedTableSignature,
    clearState,
    cancelClearAll,
  ]);

  return {
    handleClearAll,
    cancelClearAll,
    confirmClearAll,
  };
}
