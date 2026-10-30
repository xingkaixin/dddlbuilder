import { savedTableKey } from '@ddlbuilder/shared-types/workspace';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DraftSummary } from '@ddlbuilder/shared-types/workspace';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { isWorkspaceTabDirty, type WorkspaceTab } from '@/stores/tabStore';

interface UseWorkspacePresentationParams {
  activeSourceKind: 'draft' | 'saved_table';
  activeTabId: string | null;
  activeTableName: string;
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
  activeTableName,
  activeWorkspaceTab,
  draftSummaries,
  hydrated,
  isLoadedDirty,
  savedTables,
  tabs,
}: UseWorkspacePresentationParams) {
  const { t } = useTranslation();

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
  // 当前草稿标签的表名取实时编辑状态，其余草稿用快照，与未保存标记的取值方式一致。
  const tabTitles = useMemo(() => {
    const titles = new Map<string, string>();

    for (const tab of tabs) {
      if (tab.source.kind === 'saved_table') {
        titles.set(tab.id, tab.source.tableName);
        continue;
      }

      const tableName =
        tab.id === activeTabId && !tab.isLoading ? activeTableName : tab.stateSnapshot.tableName;
      titles.set(tab.id, tableName.trim() || t('app.workspace.unnamedDraft'));
    }

    return titles;
  }, [activeTabId, activeTableName, t, tabs]);
  const tablePresentations = useMemo(() => {
    const presentations = new Map<string, { title: string; isDirty: boolean }>();

    for (const tab of tabs) {
      if (tab.source.kind === 'saved_table') {
        presentations.set(savedTableKey(tab.source), {
          title: tab.source.tableName,
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
    tabTitles,
    tablePresentations,
    shouldShowWorkspaceSkeleton: activeWorkspaceTab?.isLoading === true || !hydrated,
  };
}
