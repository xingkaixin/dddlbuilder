import { savedTableKey } from '@ddlbuilder/shared-types/workspace';
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
  // 当前标签的快照只在冲刷时更新，未保存标记取实时编辑状态；其余标签用快照判断。
  const dirtyTabIds = useMemo(() => {
    const ids = new Set<string>();

    for (const tab of tabs) {
      const isDirty =
        tab.id === activeTabId
          ? activeSourceKind === 'saved_table' && isLoadedDirty
          : isWorkspaceTabDirty(tab);

      if (isDirty) ids.add(tab.id);
    }

    return ids;
  }, [activeSourceKind, activeTabId, isLoadedDirty, tabs]);
  const tablePresentations = useMemo(() => {
    const presentations = new Map<string, { title: string; isDirty: boolean }>();

    for (const tab of tabs) {
      if (tab.source.kind === 'saved_table') {
        presentations.set(savedTableKey(tab.source), {
          title: tab.title,
          isDirty: dirtyTabIds.has(tab.id),
        });
      }
    }

    return presentations;
  }, [dirtyTabIds, tabs]);

  return {
    dirtyTabIds,
    recentDrafts,
    recentTables,
    tablePresentations,
    shouldShowWorkspaceSkeleton: activeWorkspaceTab?.isLoading === true || !hydrated,
  };
}
