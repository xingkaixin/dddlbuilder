import { useCallback } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceScope, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import { writeWorkspaceSession } from '@/utils/workspaceStateDb';
import type { useTabLifecycle } from './useTabLifecycle';

export const SHARE_COPY_SAVED_TOAST_KEY = 'ddlbuilder:share:copy-saved:v1';

interface UseSavedTableTabIntegrationParams {
  isShareView: boolean;
  workspaceScope: WorkspaceScope | null;
  activeSource: WorkspaceSelection;
  deleteDraftById: (draftId: string) => void;
  removeSavedTableDraft: (normalizedName: string) => void;
  buildPersistedState: () => PersistedState;
  tabs: Pick<
    ReturnType<typeof useTabLifecycle>,
    | 'updateActiveTabTitle'
    | 'updateActiveTabSource'
    | 'updateActiveTabSnapshot'
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
  buildPersistedState,
  tabs,
}: UseSavedTableTabIntegrationParams) {
  const {
    updateActiveTabTitle,
    updateActiveTabSource,
    updateActiveTabSnapshot,
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

      if (mode === 'create' && activeSource.kind === 'draft') {
        deleteDraftById(activeSource.draftId);
      }
      removeSavedTableDraft(normalizedName);
      updateActiveTabTitle(displayName);
      updateActiveTabSource({
        kind: 'saved_table',
        normalizedName,
        tableName: displayName,
        baseSignature,
      });
      updateActiveTabSnapshot(buildPersistedState());
    },
    [
      activeSource,
      buildPersistedState,
      deleteDraftById,
      isShareView,
      removeSavedTableDraft,
      updateActiveTabSnapshot,
      updateActiveTabSource,
      updateActiveTabTitle,
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
