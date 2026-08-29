import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type {
  WorkspaceSavePayload,
  WorkspaceSelection,
  WorkspaceSource,
} from '@ddlbuilder/shared-types/workspace';
import { useTabStore, type WorkspaceTab } from '@/stores';
import { buildPersistedStateSignature } from '@/utils/persistedStateSignature';
import { useShallow } from 'zustand/react/shallow';
import { applySavedState } from '../applySavedState';

interface UseTabLifecycleParams {
  enabled: boolean;
  activeTableName: string;
  getCurrentState: () => PersistedState;
  saveState: (payload: WorkspaceSavePayload) => void;
  selectWorkspaceSnapshot: (source: WorkspaceSelection, state: PersistedState) => void;
  resolveWorkspaceSnapshot: (
    source: WorkspaceSelection,
  ) => { source: WorkspaceSelection; state: PersistedState } | null;
  resetWorkspaceSelection: () => void;
}

export function useTabLifecycle({
  enabled,
  activeTableName,
  getCurrentState,
  saveState,
  selectWorkspaceSnapshot,
  resolveWorkspaceSnapshot,
  resetWorkspaceSelection,
}: UseTabLifecycleParams) {
  const { t } = useTranslation();
  const { tabs, activeTabId } = useTabStore(
    useShallow((state) => ({ tabs: state.tabs, activeTabId: state.activeTabId })),
  );
  const {
    addTab,
    activateTab,
    closeTab: closeTabStore,
    hydrateTab,
    updateActiveTabSnapshot,
    updateDraftTitle,
    updateActiveTabSource,
    findTabBySource,
    getActiveTab,
    getTabById,
    renameSavedTableTabs,
  } = useTabStore.getState();

  const activeWorkspaceTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  // 标签会先激活、编辑器再替换；等待表名与目标快照对齐，避免写入上一标签的标题。
  const previousActiveTabId = useRef(activeTabId);
  const pendingDraftTitleId = useRef<string | null>(null);
  const activeDraftId = activeWorkspaceTab?.source.kind === 'draft' ? activeWorkspaceTab.id : null;
  const activeSnapshotTableName = activeWorkspaceTab?.stateSnapshot.tableName;
  useLayoutEffect(() => {
    const activeTabChanged = previousActiveTabId.current !== activeTabId;
    previousActiveTabId.current = activeTabId;
    if (activeTabChanged) pendingDraftTitleId.current = activeDraftId;
    if (!enabled || !activeDraftId) return;
    if (
      pendingDraftTitleId.current === activeDraftId &&
      activeTableName !== activeSnapshotTableName
    ) {
      return;
    }
    pendingDraftTitleId.current = null;
    const title = activeTableName.trim() || t('app.workspace.globalDraft');
    updateDraftTitle(activeDraftId, title);
  }, [
    activeDraftId,
    activeSnapshotTableName,
    activeTabId,
    activeTableName,
    enabled,
    t,
    updateDraftTitle,
  ]);
  // 编辑器是唯一真相源，标签快照只在冲刷点回写；内容没变时跳过，避免无谓的持久化。
  const flushActiveTab = useCallback(() => {
    if (!enabled || !activeWorkspaceTab || activeWorkspaceTab.isLoading) return;
    const currentState = getCurrentState();
    const tabSnapshotSignature = buildPersistedStateSignature(activeWorkspaceTab.stateSnapshot);
    if (tabSnapshotSignature === buildPersistedStateSignature(currentState)) return;

    updateActiveTabSnapshot(currentState);
    saveState({ state: currentState, source: activeWorkspaceTab.source });
  }, [enabled, activeWorkspaceTab, getCurrentState, updateActiveTabSnapshot, saveState]);

  const showTab = useCallback(
    (tab: WorkspaceTab) => {
      const snapshot = resolveWorkspaceSnapshot(tab.source) ?? {
        source: tab.source,
        state: tab.stateSnapshot,
      };
      hydrateTab(tab.id, snapshot.source, snapshot.state);
      activateTab(tab.id);
      applySavedState(snapshot.state);
      selectWorkspaceSnapshot(snapshot.source, snapshot.state);
    },
    [activateTab, hydrateTab, resolveWorkspaceSnapshot, selectWorkspaceSnapshot],
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
      } else {
        resetWorkspaceSelection();
      }
    },
    [activeTabId, flushActiveTab, closeTabStore, getActiveTab, resetWorkspaceSelection, showTab],
  );

  const closeTabBySource = useCallback(
    (source: WorkspaceSource) => {
      const tab = findTabBySource(source);
      if (tab) closeTab(tab.id);
    },
    [closeTab, findTabBySource],
  );

  return {
    tabs,
    activeTabId,
    activeWorkspaceTab,
    addTab,
    activateTab,
    hydrateTab,
    findTabBySource,
    getActiveTab,
    getTabById,
    renameSavedTableTabs,
    updateActiveTabSource,
    updateActiveTabSnapshot,
    flushActiveTab,
    showTab,
    switchToTab,
    switchToTabById,
    closeTab,
    closeTabBySource,
  };
}
