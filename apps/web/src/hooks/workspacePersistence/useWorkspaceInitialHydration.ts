import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import type * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type {
  SavedTableDraftRecord,
  WorkspaceScope,
  WorkspaceSelection,
} from '@ddlbuilder/shared-types/workspace';
import { savedTableReference } from '@ddlbuilder/shared-types/workspace';
import { shareStateOptions } from '@/queries/share';
import { ShareApiError } from '@/services/shareService';
import { reportError } from '@/utils/errorReporter';
import {
  getSavedDraftFromYDoc,
  getSavedTableFromYDoc,
  listDraftRecordsFromYDoc,
  listSavedDraftsFromYDoc,
  listTrashedDraftRecordsFromYDoc,
} from '@/services/workspaceYDocAdapter';
import { listSavedDrafts, listTrashedDrafts } from '@/utils/workspaceStateDb';
import { getWorkspaceBootstrap } from './bootstrap';
import {
  collectBootstrapDrafts,
  resolveWorkspaceHydration,
  toHydrationSavedTable,
  type DraftEntry,
  type WorkspaceHydration,
} from './hydration';
import { normalizePersistedState, normalizeWorkspaceSession } from './normalize';
import { leaveShareRoute } from './shareRoute';
import { readStorageJson, writeStorageJson } from './storage';

interface UseWorkspaceInitialHydrationParams {
  pathInvalid: boolean;
  shareId: string | null;
  shareStorageKey: string | null;
  currentScope: WorkspaceScope;
  workspaceScopeReady: boolean;
  shouldWaitForYDocHydration: boolean;
  yDoc: Y.Doc | null;
  setPersistedState: (state: PersistedState | null) => void;
  syncActiveSource: (source: WorkspaceSelection) => void;
  replaceDrafts: (drafts: DraftEntry[]) => void;
  replaceTrashedDrafts: (drafts: DraftEntry[]) => void;
  replaceSavedTableDrafts: (records: Map<string, SavedTableDraftRecord>) => void;
}

export function useWorkspaceInitialHydration({
  pathInvalid,
  shareId,
  shareStorageKey,
  currentScope,
  workspaceScopeReady,
  shouldWaitForYDocHydration,
  yDoc,
  setPersistedState,
  syncActiveSource,
  replaceDrafts,
  replaceTrashedDrafts,
  replaceSavedTableDrafts,
}: UseWorkspaceInitialHydrationParams) {
  const shareQuery = useQuery({
    ...shareStateOptions(shareId ?? ''),
    enabled: Boolean(shareId && shareStorageKey && !pathInvalid),
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrateWithState = (state: PersistedState | null) => {
      if (cancelled) return;
      setPersistedState(state);
      setHydrated(true);
    };
    const applyHydration = ({ activeSource, state }: WorkspaceHydration) => {
      syncActiveSource(activeSource);
      hydrateWithState(state);
    };
    const loadTrashedDrafts = async () => {
      const trashed = await listTrashedDrafts(currentScope);
      if (!cancelled) replaceTrashedDrafts(trashed);
    };
    const hydrateYDocWorkspace = async () => {
      if (!yDoc) return false;
      replaceSavedTableDrafts(listSavedDraftsFromYDoc(yDoc));
      const drafts = listDraftRecordsFromYDoc(yDoc);
      replaceDrafts(drafts);
      replaceTrashedDrafts(listTrashedDraftRecordsFromYDoc(yDoc));
      if (cancelled) return true;

      const { session } = await getWorkspaceBootstrap(currentScope);
      if (cancelled) return true;
      applyHydration(
        resolveWorkspaceHydration({
          drafts,
          session: normalizeWorkspaceSession(session),
          findSavedTable: (target) => {
            try {
              const savedTable = getSavedTableFromYDoc(yDoc, target);
              if (!savedTable || savedTable.trashedAt != null) return null;
              return toHydrationSavedTable(savedTable, getSavedDraftFromYDoc(yDoc, savedTable));
            } catch (error) {
              reportError(error, { scope: 'workspaceHydration', action: 'resolveSavedTable' });
              return null;
            }
          },
        }),
      );
      return true;
    };
    const hydrateMainWorkspace = async () => {
      if (await hydrateYDocWorkspace()) return;
      const bootstrap = await getWorkspaceBootstrap(currentScope);
      if (cancelled) return;
      const savedDrafts = await listSavedDrafts(currentScope);
      if (cancelled) return;
      replaceSavedTableDrafts(new Map(Object.entries(savedDrafts)));
      const drafts = collectBootstrapDrafts(bootstrap);
      replaceDrafts(drafts);
      await loadTrashedDrafts();
      if (cancelled) return;
      applyHydration(
        resolveWorkspaceHydration({
          drafts,
          session: normalizeWorkspaceSession(bootstrap.session),
          findSavedTable: (target) =>
            toHydrationSavedTable(
              bootstrap.savedTable,
              savedDrafts[savedTableReference(target).normalizedName],
            ),
        }),
      );
    };

    if (pathInvalid) {
      toast(i18n.t('app.shareLoadFailed'));
      leaveShareRoute();
      return () => {
        cancelled = true;
      };
    }

    if (!shareId || !shareStorageKey) {
      if (!workspaceScopeReady || shouldWaitForYDocHydration) {
        return () => {
          cancelled = true;
        };
      }
      void hydrateMainWorkspace();
      return () => {
        cancelled = true;
      };
    }

    const cachedShareState = normalizePersistedState(readStorageJson<unknown>(shareStorageKey));
    if (cachedShareState) hydrateWithState(cachedShareState);

    if (shareQuery.isSuccess) {
      hydrateWithState(shareQuery.data);
      writeStorageJson(shareStorageKey, shareQuery.data);
    } else if (shareQuery.isError) {
      const messageKey =
        shareQuery.error instanceof ShareApiError && shareQuery.error.code === 'SHARE_NOT_FOUND'
          ? 'app.shareNotFound'
          : 'app.shareLoadFailed';
      toast(i18n.t(messageKey));
      leaveShareRoute();
    }

    return () => {
      cancelled = true;
    };
  }, [
    currentScope,
    pathInvalid,
    replaceDrafts,
    replaceSavedTableDrafts,
    replaceTrashedDrafts,
    shareId,
    shareQuery.data,
    shareQuery.error,
    shareQuery.isError,
    shareQuery.isSuccess,
    shareStorageKey,
    setPersistedState,
    shouldWaitForYDocHydration,
    syncActiveSource,
    workspaceScopeReady,
    yDoc,
  ]);

  return { hydrated, setHydrated };
}
