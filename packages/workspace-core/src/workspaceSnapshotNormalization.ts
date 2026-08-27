import { toSchemaDocumentState } from '@ddlbuilder/shared-types';
import type {
  WorkspaceMigrationSnapshot,
  WorkspaceSnapshot,
} from '@ddlbuilder/shared-types/workspace';
import { DEFAULT_DRAFT_ID, shouldAcceptSnapshotRecord } from './snapshotMergePolicy';

export type CanonicalWorkspaceSnapshot = Omit<WorkspaceSnapshot, 'globalDraft'> & {
  globalDraft: null;
};

export const normalizeWorkspaceSnapshot = (
  snapshot: WorkspaceSnapshot,
): CanonicalWorkspaceSnapshot => {
  const defaultDrafts = snapshot.drafts.filter((draft) => draft.draftId === DEFAULT_DRAFT_ID);
  let defaultDraft = defaultDrafts.reduce<(typeof defaultDrafts)[number] | undefined>(
    (latest, draft) => (!latest || draft.updatedAt > latest.updatedAt ? draft : latest),
    undefined,
  );

  if (
    snapshot.globalDraft &&
    snapshot.globalDraft.updatedAt > (defaultDraft?.updatedAt ?? -Infinity)
  ) {
    defaultDraft = {
      ...defaultDraft,
      draftId: DEFAULT_DRAFT_ID,
      state: snapshot.globalDraft.state,
      updatedAt: snapshot.globalDraft.updatedAt,
    };
  }

  return {
    globalDraft: null,
    drafts: [
      ...(defaultDraft ? [defaultDraft] : []),
      ...snapshot.drafts.filter((draft) => draft.draftId !== DEFAULT_DRAFT_ID),
    ],
    savedTables: snapshot.savedTables,
    savedDrafts: snapshot.savedDrafts,
    folders: snapshot.folders,
  };
};

export const normalizeWorkspaceMigrationSnapshot = (
  snapshot: WorkspaceMigrationSnapshot,
): CanonicalWorkspaceSnapshot => {
  const normalized = normalizeWorkspaceSnapshot(snapshot);
  const session = snapshot.activeSession;
  if (!session?.activeState || session.activeSource.kind !== 'draft') return normalized;

  const draftId = session.activeSource.draftId;
  const existing = normalized.drafts.find((draft) => draft.draftId === draftId);
  if (!shouldAcceptSnapshotRecord(session.updatedAt, existing?.updatedAt)) return normalized;

  const draft = {
    ...existing,
    draftId,
    state: toSchemaDocumentState(session.activeState),
    updatedAt: session.updatedAt,
  };
  return {
    ...normalized,
    drafts: existing
      ? normalized.drafts.map((item) => (item.draftId === draftId ? draft : item))
      : [...normalized.drafts, draft],
  };
};
