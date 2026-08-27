import { useCallback } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type {
  SavedTableDraftRecord,
  WorkspaceScope,
  WorkspaceSelection,
} from '@ddlbuilder/shared-types/workspace';
import { writeWorkspaceSession } from '@/utils/workspaceStateDb';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
import type { useTabLifecycle } from './useTabLifecycle';

export const SHARE_COPY_SAVED_TOAST_KEY = 'ddlbuilder:share:copy-saved:v1';

interface UseSavedTableTabIntegrationParams {
  isShareView: boolean;
  workspaceScope: WorkspaceScope | null;
  activeSource: WorkspaceSelection;
  deleteDraftById: (draftId: string) => void;
  removeSavedTableDraft: (normalizedName: string) => void;
  persistSavedTableDraft: (normalizedName: string, record: SavedTableDraftRecord) => void;
  selectWorkspaceSnapshot: (source: WorkspaceSelection, state: PersistedState) => void;
  buildPersistedState: () => PersistedState;
  tabs: Pick<
    ReturnType<typeof useTabLifecycle>,
    | 'activeTabId'
    | 'getActiveTab'
    | 'getTabById'
    | 'hydrateTab'
    | 'renameSavedTableTabs'
    | 'closeTabBySource'
  >;
}

export function useSavedTableTabIntegration({
  isShareView,
  workspaceScope,
  activeSource,
  deleteDraftById,
  removeSavedTableDraft,
  persistSavedTableDraft,
  selectWorkspaceSnapshot,
  buildPersistedState,
  tabs,
}: UseSavedTableTabIntegrationParams) {
  const {
    activeTabId,
    getActiveTab,
    getTabById,
    hydrateTab,
    renameSavedTableTabs,
    closeTabBySource,
  } = tabs;
  const onSaveSuccess = useCallback(
    async ({
      normalizedName,
      displayName,
      baseSignature,
      mode,
    }: {
      normalizedName: string;
      displayName: string;
      baseSignature: string;
      mode: 'create' | 'update';
    }) => {
      if (isShareView) {
        try {
          if (!workspaceScope) throw new Error('工作区未就绪');
          await writeWorkspaceSession(
            {
              activeSource: { kind: 'saved_table', normalizedName },
              updatedAt: Date.now(),
            },
            workspaceScope,
          );
          sessionStorage.setItem(SHARE_COPY_SAVED_TOAST_KEY, displayName);
        } catch {
          // 本地会话写入失败也必须离开只读分享页。
        }
        window.location.replace('/');
        return;
      }

      const tab = activeTabId ? getTabById(activeTabId) : undefined;
      if (!tab) return;
      const isActive = getActiveTab()?.id === tab.id;
      const state = isActive ? buildPersistedState() : tab.stateSnapshot;
      const source: WorkspaceSelection = {
        kind: 'saved_table',
        normalizedName,
        tableName: displayName,
        baseSignature,
      };
      if (serializePersistedStateForComparison(state) === baseSignature) {
        removeSavedTableDraft(normalizedName);
      } else {
        persistSavedTableDraft(normalizedName, {
          state,
          tableName: displayName,
          baseSignature,
          updatedAt: Date.now(),
        });
      }
      hydrateTab(tab.id, source, state);
      if (isActive) selectWorkspaceSnapshot(source, state);
      if (mode === 'create' && activeSource.kind === 'draft') {
        deleteDraftById(activeSource.draftId);
      }
    },
    [
      activeSource,
      activeTabId,
      buildPersistedState,
      deleteDraftById,
      isShareView,
      removeSavedTableDraft,
      persistSavedTableDraft,
      selectWorkspaceSnapshot,
      getActiveTab,
      getTabById,
      hydrateTab,
      workspaceScope,
    ],
  );

  const onTabRemove = useCallback(
    (normalizedName: string) => {
      closeTabBySource({ kind: 'saved_table', normalizedName });
    },
    [closeTabBySource],
  );

  return { onSaveSuccess, onTabRename: renameSavedTableTabs, onTabRemove };
}
