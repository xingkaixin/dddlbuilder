import { useAppUiStore } from '@/stores';
import { useShallow } from 'zustand/react/shallow';

export function useAppUiSelectors() {
  const actions = useAppUiStore.getState();
  const state = useAppUiStore(
    useShallow((current) => ({
      savedTablesDrawerOpen: current.savedTablesDrawerOpen,
      isSaveDialogOpen: current.dialogs.save,
      isRenameDialogOpen: current.dialogs.rename,
      isDeleteDialogOpen: current.dialogs.delete,
      isClearDialogOpen: current.isClearDialogOpen,
      showFireworks: current.showFireworks,
      isDiffDialogOpen: current.isDiffDialogOpen,
      versionHistoryTarget: current.versionHistoryTarget,
      timelinePlayerTarget: current.timelinePlayerTarget,
      isReviewHistoryOpen: current.isReviewHistoryOpen,
      isStorageEstimatorOpen: current.isStorageEstimatorOpen,
      isAIGenerateDialogOpen: current.isAIGenerateDialogOpen,
      isMockDataDialogOpen: current.isMockDataDialogOpen,
    })),
  );

  return {
    ...state,
    setSavedTablesDrawerOpen: actions.setSavedTablesDrawerOpen,
    setIsSaveDialogOpen: actions.setIsSaveDialogOpen,
    setIsRenameDialogOpen: actions.setIsRenameDialogOpen,
    setIsDeleteDialogOpen: actions.setIsDeleteDialogOpen,
    setIsClearDialogOpen: actions.setIsClearDialogOpen,
    setShowFireworks: actions.setShowFireworks,
    setIsDiffDialogOpen: actions.setIsDiffDialogOpen,
    setVersionHistoryTarget: actions.setVersionHistoryTarget,
    setTimelinePlayerTarget: actions.setTimelinePlayerTarget,
    setIsReviewHistoryOpen: actions.setIsReviewHistoryOpen,
    setIsStorageEstimatorOpen: actions.setIsStorageEstimatorOpen,
    setIsAIGenerateDialogOpen: actions.setIsAIGenerateDialogOpen,
    setIsMockDataDialogOpen: actions.setIsMockDataDialogOpen,
  };
}
