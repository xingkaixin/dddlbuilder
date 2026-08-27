import { useEffect } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type {
  SavedTableDraftRecord,
  WorkspaceScope,
  WorkspaceSelection,
} from '@ddlbuilder/shared-types/workspace';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import { DEFAULT_DRAFT_ID, listSavedDrafts } from '@/utils/workspaceStateDb';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
import { getWorkspaceBootstrap, resetWorkspaceBootstrapCache } from './bootstrap';
import {
  collectBootstrapDrafts,
  pickInitialDraft,
  toHydrationSavedTable,
  type DraftEntry,
} from './hydration';
import { normalizeWorkspaceSession } from './normalize';

interface UseWorkspaceSnapshotRefreshParams {
  disabled: boolean;
  currentScope: WorkspaceScope;
  replaceDrafts: (drafts: DraftEntry[]) => void;
  replaceSavedTableDrafts: (records: Map<string, SavedTableDraftRecord>) => void;
  syncActiveSource: (source: WorkspaceSelection) => void;
  setPersistedStateIfChanged: (state: PersistedState | null) => void;
  setHydrated: (hydrated: boolean) => void;
}

export function useWorkspaceSnapshotRefresh({
  disabled,
  currentScope,
  replaceDrafts,
  replaceSavedTableDrafts,
  syncActiveSource,
  setPersistedStateIfChanged,
  setHydrated,
}: UseWorkspaceSnapshotRefreshParams) {
  useEffect(() => {
    if (disabled) return;

    let cancelled = false;
    const handleSnapshotApplied = () => {
      void (async () => {
        resetWorkspaceBootstrapCache();
        const bootstrap = await getWorkspaceBootstrap(currentScope);
        const savedDrafts = await listSavedDrafts(currentScope);
        if (cancelled) return;
        replaceSavedTableDrafts(new Map(Object.entries(savedDrafts)));

        const drafts = collectBootstrapDrafts(bootstrap);
        replaceDrafts(drafts);
        const session = normalizeWorkspaceSession(bootstrap.session);
        const savedTable =
          session?.activeSource.kind === 'saved_table'
            ? toHydrationSavedTable(
                bootstrap.savedTable,
                savedDrafts[session.activeSource.normalizedName],
              )
            : null;

        if (savedTable) {
          syncActiveSource({
            kind: 'saved_table',
            ...(savedTable.tableId ? { tableId: savedTable.tableId } : {}),
            normalizedName: savedTable.normalizedName,
            tableName: savedTable.tableName,
            baseSignature: serializePersistedStateForComparison(savedTable.state),
          });
          setPersistedStateIfChanged(
            savedTable.draftState ?? session?.activeState ?? savedTable.state,
          );
          setHydrated(true);
          return;
        }

        const sessionDraftId =
          session?.activeSource.kind === 'draft' ? session.activeSource.draftId : DEFAULT_DRAFT_ID;
        const resolvedDraft =
          drafts.find((draft) => draft.draftId === sessionDraftId) ?? pickInitialDraft(drafts);
        syncActiveSource({ kind: 'draft', draftId: resolvedDraft?.draftId ?? sessionDraftId });
        setPersistedStateIfChanged(resolvedDraft?.record.state ?? session?.activeState ?? null);
        setHydrated(true);
      })();
    };

    window.addEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    return () => {
      cancelled = true;
      window.removeEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    };
  }, [
    currentScope,
    disabled,
    replaceDrafts,
    replaceSavedTableDrafts,
    setHydrated,
    setPersistedStateIfChanged,
    syncActiveSource,
  ]);
}
