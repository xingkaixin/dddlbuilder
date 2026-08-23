import { useCallback } from 'react';
import type { SavedTableSummary } from '@/hooks/useSavedTables';

interface UseNavigationActionsParams {
  setSavedTablesDrawerOpen: (open: boolean) => void;
  setIsDiffDialogOpen: (open: boolean) => void;
  setActiveTab: (tab: string) => void;
  setIsStorageEstimatorOpen: (open: boolean) => void;
  setVersionHistoryTarget: (
    target: {
      normalizedName: string;
      name: string;
    } | null,
  ) => void;
  setIsAIGenerateDialogOpen: (open: boolean) => void;
  setIsMockDataDialogOpen: (open: boolean) => void;
}

export function useNavigationActions({
  setSavedTablesDrawerOpen,
  setIsDiffDialogOpen,
  setActiveTab,
  setIsStorageEstimatorOpen,
  setVersionHistoryTarget,
  setIsAIGenerateDialogOpen,
  setIsMockDataDialogOpen,
}: UseNavigationActionsParams) {
  const handleOpenSavedTablesDrawer = useCallback(() => {
    setSavedTablesDrawerOpen(true);
  }, [setSavedTablesDrawerOpen]);

  const handleOpenDiffDialog = useCallback(() => {
    setIsDiffDialogOpen(true);
  }, [setIsDiffDialogOpen]);

  const handleOpenStorageEstimator = useCallback(() => {
    setIsStorageEstimatorOpen(true);
  }, [setIsStorageEstimatorOpen]);

  const handleViewVersionHistory = useCallback(
    (item: SavedTableSummary) => {
      setVersionHistoryTarget({
        normalizedName: item.normalizedName,
        name: item.name,
      });
    },
    [setVersionHistoryTarget],
  );

  const handleOpenAIGenerateDialog = useCallback(() => {
    setIsAIGenerateDialogOpen(true);
  }, [setIsAIGenerateDialogOpen]);

  const handleOpenMockDataGenerator = useCallback(() => {
    setIsMockDataDialogOpen(true);
  }, [setIsMockDataDialogOpen]);

  return {
    handleOpenSavedTablesDrawer,
    handleOpenDiffDialog,
    handleTabValueChange: setActiveTab,
    handleOpenStorageEstimator,
    handleViewVersionHistory,
    handleOpenAIGenerateDialog,
    handleOpenMockDataGenerator,
  };
}
