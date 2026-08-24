import { useCallback } from 'react';
import type { VersionHistoryTarget } from '@/stores';
import type { BuilderTab } from '@/utils/tabUtils';

interface UseNavigationActionsParams {
  setSavedTablesDrawerOpen: (open: boolean) => void;
  setIsDiffDialogOpen: (open: boolean) => void;
  setActiveTab: (tab: BuilderTab) => void;
  setIsStorageEstimatorOpen: (open: boolean) => void;
  setVersionHistoryTarget: (target: VersionHistoryTarget | null) => void;
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
    (item: VersionHistoryTarget) => {
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
