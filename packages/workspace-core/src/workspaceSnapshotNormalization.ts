import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import { DEFAULT_DRAFT_ID } from './snapshotMergePolicy';

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
