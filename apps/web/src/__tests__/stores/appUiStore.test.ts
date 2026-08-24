import { beforeEach, describe, expect, it } from 'vitest';
import { useAppUiStore } from '@/stores';

function resetUiStore() {
  const state = useAppUiStore.getState();
  state.setWorkspaceSidebarOpen(true);
  state.setOutputPanelOpen(true);
  state.setSavedTablesDrawerOpen(false);
  state.setIsImportDialogOpen(false);
  state.setIsErDialogOpen(false);
  state.setIsAISchemaPatchOpen(false);
  state.setIsSaveDialogOpen(false);
  state.setIsRenameDialogOpen(false);
  state.setIsDeleteDialogOpen(false);
  state.setIsClearDialogOpen(false);
  state.setShowFireworks(false);
  state.setIsDiffDialogOpen(false);
  state.setVersionHistoryTarget(null);
  state.setTimelinePlayerTarget(null);
  state.setIsReviewHistoryOpen(false);
  state.setIsStorageEstimatorOpen(false);
  state.setIsAIGenerateDialogOpen(false);
  state.setIsMockDataDialogOpen(false);
}

describe('appUiStore', () => {
  beforeEach(resetUiStore);

  it('集中管理应用布局和核心弹窗', () => {
    const state = useAppUiStore.getState();

    state.setWorkspaceSidebarOpen(false);
    state.setOutputPanelOpen(false);
    state.setSavedTablesDrawerOpen(true);
    state.setIsImportDialogOpen(true);
    state.setIsSaveDialogOpen(true);
    state.setIsRenameDialogOpen(true);
    state.setIsDeleteDialogOpen(true);

    expect(useAppUiStore.getState()).toMatchObject({
      workspaceSidebarOpen: false,
      outputPanelOpen: false,
      savedTablesDrawerOpen: true,
      isImportDialogOpen: true,
      dialogs: {
        save: true,
        rename: true,
        delete: true,
      },
    });
  });

  it('集中管理全局工具弹窗及其目标', () => {
    const target = { normalizedName: 'users', name: 'Users' };
    const state = useAppUiStore.getState();

    state.setIsClearDialogOpen(true);
    state.setShowFireworks(true);
    state.setIsDiffDialogOpen(true);
    state.setVersionHistoryTarget(target);
    state.setTimelinePlayerTarget(target);
    state.setIsReviewHistoryOpen(true);
    state.setIsStorageEstimatorOpen(true);
    state.setIsAIGenerateDialogOpen(true);
    state.setIsMockDataDialogOpen(true);

    expect(useAppUiStore.getState()).toMatchObject({
      isClearDialogOpen: true,
      showFireworks: true,
      isDiffDialogOpen: true,
      versionHistoryTarget: target,
      timelinePlayerTarget: target,
      isReviewHistoryOpen: true,
      isStorageEstimatorOpen: true,
      isAIGenerateDialogOpen: true,
      isMockDataDialogOpen: true,
    });
  });
});
