import { create } from 'zustand';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSource } from '@ddlbuilder/shared-types/workspace';

export interface WorkspaceTab {
  id: string;
  title: string;
  source: WorkspaceSource;
  stateSnapshot: PersistedState;
  isDirty: boolean;
  isLoading?: boolean;
}

function isSameSourceId(a: WorkspaceSource, b: WorkspaceSource): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'draft' && b.kind === 'draft') return a.draftId === b.draftId;
  if (a.kind === 'saved_table' && b.kind === 'saved_table') {
    return a.normalizedName === b.normalizedName;
  }
  return false;
}

interface TabStoreState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;

  addTab: (params: Omit<WorkspaceTab, 'id'>) => string;
  activateTab: (id: string) => void;
  closeTab: (id: string) => void;
  updateActiveTabSnapshot: (state: PersistedState, isDirty: boolean) => void;
  updateActiveTabTitle: (title: string) => void;
  updateActiveTabSource: (source: WorkspaceSource) => void;
  findTabBySource: (source: WorkspaceSource) => WorkspaceTab | undefined;
  getActiveTab: () => WorkspaceTab | undefined;
  setTabLoading: (id: string, isLoading: boolean) => void;
  removeTabBySource: (source: WorkspaceSource) => void;
  updateTabTitleBySource: (source: WorkspaceSource, title: string) => void;
}

export const useTabStore = create<TabStoreState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (params) => {
    const id = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tab: WorkspaceTab = { ...params, id };
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }));
    return id;
  },

  activateTab: (id) => {
    set({ activeTabId: id });
  },

  closeTab: (id) => {
    set((state) => {
      const index = state.tabs.findIndex((t) => t.id === id);
      if (index === -1) return state;

      const nextTabs = state.tabs.filter((t) => t.id !== id);
      let nextActiveId = state.activeTabId;

      if (state.activeTabId === id) {
        // 激活相邻标签页：优先右侧，否则左侧最后一个
        const nextTab = state.tabs[index + 1] ?? state.tabs[index - 1];
        nextActiveId = nextTab?.id ?? null;
      }

      return { tabs: nextTabs, activeTabId: nextActiveId };
    });
  },

  updateActiveTabSnapshot: (stateSnapshot, isDirty) => {
    set((s) => {
      if (!s.activeTabId) return s;
      return {
        tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, stateSnapshot, isDirty } : t)),
      };
    });
  },

  updateActiveTabTitle: (title) => {
    set((s) => {
      if (!s.activeTabId) return s;
      return {
        tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, title } : t)),
      };
    });
  },

  updateActiveTabSource: (source) => {
    set((s) => {
      if (!s.activeTabId) return s;
      return {
        tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, source } : t)),
      };
    });
  },

  findTabBySource: (source) => {
    return get().tabs.find((t) => isSameSourceId(t.source, source));
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId);
  },

  setTabLoading: (id, isLoading) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, isLoading } : t)),
    }));
  },

  removeTabBySource: (source) => {
    set((state) => {
      const tabToRemove = state.tabs.find((t) => isSameSourceId(t.source, source));
      if (!tabToRemove) return state;

      const nextTabs = state.tabs.filter((t) => t.id !== tabToRemove.id);
      let nextActiveId = state.activeTabId;

      if (state.activeTabId === tabToRemove.id) {
        const index = state.tabs.findIndex((t) => t.id === tabToRemove.id);
        const nextTab = state.tabs[index + 1] ?? state.tabs[index - 1];
        nextActiveId = nextTab?.id ?? null;
      }

      return { tabs: nextTabs, activeTabId: nextActiveId };
    });
  },

  updateTabTitleBySource: (source, title) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (isSameSourceId(t.source, source) ? { ...t, title } : t)),
    }));
  },
}));
