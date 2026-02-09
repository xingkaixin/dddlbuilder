import { useCallback } from 'react';
import type { SavedTableSummary } from '@/hooks/useSavedTables';

type AnalyticsValue = string | number | boolean | null | undefined;

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
  setIsVersionHistoryOpen: (open: boolean) => void;
  setIsAIGenerateDialogOpen: (open: boolean) => void;
  trackEvent: (
    event: string,
    data?: Record<string, AnalyticsValue>,
  ) => Promise<void> | void;
}

export function useNavigationActions({
  setSavedTablesDrawerOpen,
  setIsDiffDialogOpen,
  setActiveTab,
  setIsStorageEstimatorOpen,
  setVersionHistoryTarget,
  setIsVersionHistoryOpen,
  setIsAIGenerateDialogOpen,
  trackEvent,
}: UseNavigationActionsParams) {
  const handleOpenSavedTablesDrawer = useCallback(() => {
    trackEvent('sidebar_open');
    setSavedTablesDrawerOpen(true);
  }, [trackEvent, setSavedTablesDrawerOpen]);

  const handleOpenDiffDialog = useCallback(() => {
    trackEvent('diff_view_open');
    setIsDiffDialogOpen(true);
  }, [trackEvent, setIsDiffDialogOpen]);

  const handleTabValueChange = useCallback(
    (value: string) => {
      setActiveTab(value);
      trackEvent('tab_switch', { tab: value });
    },
    [setActiveTab, trackEvent],
  );

  const handleOpenStorageEstimator = useCallback(() => {
    trackEvent('storage_estimator_open');
    setIsStorageEstimatorOpen(true);
  }, [trackEvent, setIsStorageEstimatorOpen]);

  const handleViewVersionHistory = useCallback(
    (item: SavedTableSummary) => {
      setVersionHistoryTarget({
        normalizedName: item.normalizedName,
        name: item.name,
      });
      setIsVersionHistoryOpen(true);
    },
    [setVersionHistoryTarget, setIsVersionHistoryOpen],
  );

  const handleOpenAIGenerateDialog = useCallback(() => {
    setIsAIGenerateDialogOpen(true);
  }, [setIsAIGenerateDialogOpen]);

  return {
    handleOpenSavedTablesDrawer,
    handleOpenDiffDialog,
    handleTabValueChange,
    handleOpenStorageEstimator,
    handleViewVersionHistory,
    handleOpenAIGenerateDialog,
  };
}
