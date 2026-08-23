import { useMemo } from 'react';
import type { DraftSummary } from '@ddlbuilder/shared-types/workspace';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { isWorkspaceTabDirty, type WorkspaceTab } from '@/stores/tabStore';

interface UseWorkspacePresentationParams {
  activeSourceKind: 'draft' | 'saved_table';
  activeTabId: string | null;
  activeWorkspaceTab: WorkspaceTab | null;
  draftSummaries: DraftSummary[];
  hydrated: boolean;
  isLoadedDirty: boolean;
  isShareView: boolean;
  savedTables: SavedTableSummary[];
  tabs: WorkspaceTab[];
}

export function useWorkspacePresentation({
  activeSourceKind,
  activeTabId,
  activeWorkspaceTab,
  draftSummaries,
  hydrated,
  isLoadedDirty,
  isShareView,
  savedTables,
  tabs,
}: UseWorkspacePresentationParams) {
  const recentDrafts = useMemo(
    () => [...draftSummaries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3),
    [draftSummaries],
  );
  const recentTables = useMemo(
    () => [...savedTables].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3),
    [savedTables],
  );
  const presentedTabs = useMemo(
    () =>
      tabs.map((tab) =>
        tab.id === activeTabId
          ? { ...tab, isDirty: activeSourceKind === 'saved_table' && isLoadedDirty }
          : tab,
      ),
    [activeSourceKind, activeTabId, isLoadedDirty, tabs],
  );
  const tablePresentations = useMemo(() => {
    const presentations = new Map<string, { title: string; isDirty: boolean }>();
    for (const tab of presentedTabs) {
      if (tab.source.kind === 'saved_table') {
        presentations.set(tab.source.normalizedName, {
          title: tab.title,
          isDirty: isWorkspaceTabDirty(tab),
        });
      }
    }
    return presentations;
  }, [presentedTabs]);

  return {
    presentedTabs,
    recentDrafts,
    recentTables,
    tablePresentations,
    shouldShowWorkspaceSkeleton:
      activeWorkspaceTab?.isLoading === true || (isShareView && !hydrated),
  };
}
