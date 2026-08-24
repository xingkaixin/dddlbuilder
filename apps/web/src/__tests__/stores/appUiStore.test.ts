import { beforeEach, describe, expect, it } from 'vitest';
import { useAppUiStore } from '@/stores';

function resetUiStore() {
  const state = useAppUiStore.getState();
  state.setWorkspaceSidebarOpen(true);
  state.setOutputPanelOpen(true);
  state.setSavedTablesDrawerOpen(false);
  useAppUiStore.setState({ activeDialog: { kind: 'none' } });
  state.setShowFireworks(false);
}

describe('appUiStore', () => {
  beforeEach(resetUiStore);

  it('全局弹窗应互斥', () => {
    const state = useAppUiStore.getState();
    state.setIsSaveDialogOpen(true);
    state.setIsRenameDialogOpen(true);

    expect(useAppUiStore.getState().activeDialog).toEqual({ kind: 'rename' });
  });

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
      activeDialog: { kind: 'delete' },
    });
  });

  it('集中管理全局工具弹窗及其目标', () => {
    const target = { normalizedName: 'users', name: 'Users' };
    const state = useAppUiStore.getState();

    state.setShowFireworks(true);
    state.setVersionHistoryTarget(target);
    expect(useAppUiStore.getState().activeDialog).toEqual({
      kind: 'version-history',
      target,
    });

    state.setTimelinePlayerTarget(target);
    state.setVersionHistoryTarget(null);
    expect(useAppUiStore.getState().activeDialog).toEqual({
      kind: 'timeline-player',
      target,
    });

    state.setIsMockDataDialogOpen(true);

    expect(useAppUiStore.getState()).toMatchObject({
      showFireworks: true,
      activeDialog: { kind: 'mock-data' },
    });
  });
});
