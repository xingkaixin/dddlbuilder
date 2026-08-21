import { useCallback, useMemo } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSavePayload, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import { useTabStore, type WorkspaceTab } from '@/stores';
import { applySavedState } from '../applySavedState';

interface UseTabLifecycleParams {
  enabled: boolean;
  currentState: PersistedState;
  activeSource: WorkspaceSelection;
  serializePersistedState: (state: PersistedState) => string;
  saveState: (payload: WorkspaceSavePayload) => void;
  selectWorkspaceSnapshot: (source: WorkspaceSelection, state: PersistedState) => void;
}

export function useTabLifecycle({
  enabled,
  currentState,
  activeSource,
  serializePersistedState,
  saveState,
  selectWorkspaceSnapshot,
}: UseTabLifecycleParams) {
  const {
    tabs,
    activeTabId,
    addTab,
    activateTab,
    closeTab: closeTabStore,
    updateActiveTabSnapshot,
    updateActiveTabTitle,
    updateActiveTabSource,
    findTabBySource,
    getActiveTab,
    setTabLoading,
    removeTabBySource,
    updateTabTitleBySource,
  } = useTabStore();

  const activeWorkspaceTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );

  // 编辑器是唯一真相源，标签快照只在冲刷点回写；内容没变时跳过，避免无谓的持久化。
  const flushActiveTab = useCallback(() => {
    if (!enabled) return;
    const tabSnapshot = activeWorkspaceTab?.stateSnapshot ?? null;
    const tabSnapshotSignature = tabSnapshot ? serializePersistedState(tabSnapshot) : null;
    if (tabSnapshotSignature === serializePersistedState(currentState)) return;

    updateActiveTabSnapshot(currentState);
    saveState({ state: currentState, source: activeSource });
  }, [
    enabled,
    activeWorkspaceTab,
    serializePersistedState,
    currentState,
    updateActiveTabSnapshot,
    saveState,
    activeSource,
  ]);

  const showTab = useCallback(
    (tab: WorkspaceTab) => {
      activateTab(tab.id);
      applySavedState(tab.stateSnapshot);
      selectWorkspaceSnapshot(tab.source, tab.stateSnapshot);
    },
    [activateTab, selectWorkspaceSnapshot],
  );

  const switchToTab = useCallback(
    (tab: WorkspaceTab) => {
      flushActiveTab();
      showTab(tab);
    },
    [flushActiveTab, showTab],
  );

  const switchToTabById = useCallback(
    (tabId: string) => {
      const tab = tabs.find((item) => item.id === tabId);
      if (!tab || tab.id === activeTabId) return;
      switchToTab(tab);
    },
    [tabs, activeTabId, switchToTab],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const closingActiveTab = tabId === activeTabId;
      if (closingActiveTab) {
        flushActiveTab();
      }
      closeTabStore(tabId);

      // 关闭后台标签时激活对象没变，重放旧快照会把尚未冲刷的编辑回滚掉。
      if (!closingActiveTab) return;
      const nextActive = getActiveTab();
      if (nextActive) {
        showTab(nextActive);
      }
    },
    [activeTabId, flushActiveTab, closeTabStore, getActiveTab, showTab],
  );

  return {
    tabs,
    activeTabId,
    activeWorkspaceTab,
    addTab,
    activateTab,
    findTabBySource,
    getActiveTab,
    setTabLoading,
    removeTabBySource,
    updateTabTitleBySource,
    updateActiveTabTitle,
    updateActiveTabSource,
    updateActiveTabSnapshot,
    flushActiveTab,
    showTab,
    switchToTab,
    switchToTabById,
    closeTab,
  };
}
