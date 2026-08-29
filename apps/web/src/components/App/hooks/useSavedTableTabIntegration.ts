import { savedTableReference, type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { useCallback } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type {
  SavedTableDraftRecord,
  WorkspaceScope,
  WorkspaceSelection,
} from '@ddlbuilder/shared-types/workspace';
import { writeWorkspaceSession } from '@/utils/workspaceStateDb';
import { buildSchemaStateSignature } from '@/utils/persistedStateSignature';
import type { useTabLifecycle } from './useTabLifecycle';
import i18n from '@/i18n';

export const SHARE_COPY_SAVED_TOAST_KEY = 'ddlbuilder:share:copy-saved:v1';

interface UseSavedTableTabIntegrationParams {
  isShareView: boolean;
  workspaceScope: WorkspaceScope | null;
  activeSource: WorkspaceSelection;
  deleteDraftById: (draftId: string) => void;
  removeSavedTableDraft: (normalizedName: SavedTableTarget) => void;
  persistSavedTableDraft: (normalizedName: SavedTableTarget, record: SavedTableDraftRecord) => void;
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
      tableId,
      displayName,
      baseSignature,
      baseState,
      mode,
    }: {
      normalizedName: string;
      tableId?: string;
      displayName: string;
      baseSignature: string;
      baseState: PersistedState;
      mode: 'create' | 'update';
    }) => {
      if (isShareView) {
        try {
          if (!workspaceScope) throw new Error(i18n.t('savedTables.toast.workspaceNotReady'));
          await writeWorkspaceSession(
            {
              activeSource: {
                kind: 'saved_table',
                normalizedName,
                ...(tableId ? { tableId } : {}),
              },
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
        ...(tableId ? { tableId } : {}),
        tableName: displayName,
        baseSignature,
      };
      if (buildSchemaStateSignature(state) === baseSignature) {
        removeSavedTableDraft(source);
      } else {
        persistSavedTableDraft(source, {
          state,
          tableName: displayName,
          baseSignature,
          baseState,
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
    (target: SavedTableTarget) => {
      closeTabBySource({ kind: 'saved_table', ...savedTableReference(target) });
    },
    [closeTabBySource],
  );

  return { onSaveSuccess, onTabRename: renameSavedTableTabs, onTabRemove };
}
