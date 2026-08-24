import { useAppUiStore } from '@/stores';
import { useShallow } from 'zustand/react/shallow';

export function useAppUiSelectors() {
  const actions = useAppUiStore.getState();
  const state = useAppUiStore(
    useShallow((current) => {
      const { activeDialog } = current;
      return {
        workspaceSidebarOpen: current.workspaceSidebarOpen,
        outputPanelOpen: current.outputPanelOpen,
        savedTablesDrawerOpen: current.savedTablesDrawerOpen,
        isImportDialogOpen: activeDialog.kind === 'import',
        isErDialogOpen: activeDialog.kind === 'er',
        isAISchemaPatchOpen: activeDialog.kind === 'ai-schema-patch',
        isSaveDialogOpen: activeDialog.kind === 'save',
        isRenameDialogOpen: activeDialog.kind === 'rename',
        isDeleteDialogOpen: activeDialog.kind === 'delete',
        isClearDialogOpen: activeDialog.kind === 'clear',
        showFireworks: current.showFireworks,
        isDiffDialogOpen: activeDialog.kind === 'diff',
        versionHistoryTarget: activeDialog.kind === 'version-history' ? activeDialog.target : null,
        timelinePlayerTarget: activeDialog.kind === 'timeline-player' ? activeDialog.target : null,
        isReviewHistoryOpen: activeDialog.kind === 'review-history',
        isStorageEstimatorOpen: activeDialog.kind === 'storage-estimator',
        isAIGenerateDialogOpen: activeDialog.kind === 'ai-generate',
        isMockDataDialogOpen: activeDialog.kind === 'mock-data',
      };
    }),
  );

  return {
    ...state,
    setWorkspaceSidebarOpen: actions.setWorkspaceSidebarOpen,
    setOutputPanelOpen: actions.setOutputPanelOpen,
    setSavedTablesDrawerOpen: actions.setSavedTablesDrawerOpen,
    setIsImportDialogOpen: actions.setIsImportDialogOpen,
    setIsErDialogOpen: actions.setIsErDialogOpen,
    setIsAISchemaPatchOpen: actions.setIsAISchemaPatchOpen,
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
