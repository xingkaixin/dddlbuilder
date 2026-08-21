import type { PersistedState } from '@ddlbuilder/shared-types';
import type {
  SavedTableDraftRecord,
  WorkspaceScope,
  WorkspaceSnapshot,
} from '@ddlbuilder/shared-types/workspace';
import {
  addSavedTable,
  deleteSavedTable,
  getSavedTable,
  listSavedTables,
  updateSavedTable,
} from '@/utils/savedTablesDb';
import { clearFolders, bulkPutFolders } from '@/utils/tableFolders';
import {
  DEFAULT_DRAFT_ID,
  clearWorkspaceSession,
  deleteDraft,
  deleteSavedDraft,
  listDrafts,
  listSavedDrafts,
  readDraft,
  upsertSavedDraft,
  writeDraft,
} from '@/utils/workspaceStateDb';

export const WORKSPACE_SNAPSHOT_APPLIED_EVENT = 'ddlbuilder:workspace-snapshot-applied';

const upsertLocalSavedTable = async (
  input: {
    normalizedName: string;
    name: string;
    state: PersistedState;
    createdAt?: number;
    updatedAt: number;
    folderId?: string;
  },
  scope: WorkspaceScope,
) => {
  const existing = await getSavedTable(input.normalizedName, scope);
  if (existing) {
    if (existing.updatedAt > input.updatedAt) {
      return;
    }
    await updateSavedTable(
      {
        ...existing,
        name: input.name,
        state: input.state,
        createdAt: existing.createdAt ?? input.createdAt ?? input.updatedAt,
        updatedAt: input.updatedAt,
        folderId: input.folderId,
      },
      scope,
    );
    return;
  }

  await addSavedTable(
    {
      normalizedName: input.normalizedName,
      name: input.name,
      state: input.state,
      createdAt: input.createdAt ?? input.updatedAt,
      updatedAt: input.updatedAt,
      folderId: input.folderId,
    },
    scope,
  );
};

export const dispatchWorkspaceSnapshotApplied = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WORKSPACE_SNAPSHOT_APPLIED_EVENT));
  }
};

const replaceLocalWorkspaceSnapshot = async (
  snapshot: WorkspaceSnapshot,
  scope: WorkspaceScope,
) => {
  const [localDrafts, localSavedTables, localSavedDrafts] = await Promise.all([
    listDrafts(scope),
    listSavedTables(scope),
    listSavedDrafts(scope),
  ]);

  await deleteDraft(DEFAULT_DRAFT_ID, scope);
  await clearWorkspaceSession(scope);
  await clearFolders(scope);

  await Promise.all([
    ...localDrafts.map((item) => deleteDraft(item.draftId, scope)),
    ...localSavedTables.map((item) => deleteSavedTable(item.normalizedName, scope)),
    ...Object.keys(localSavedDrafts).map((normalizedName) =>
      deleteSavedDraft(normalizedName, scope),
    ),
  ]);

  if (snapshot.globalDraft) {
    await writeDraft(DEFAULT_DRAFT_ID, snapshot.globalDraft, scope);
  }

  for (const item of snapshot.drafts) {
    await writeDraft(
      item.draftId,
      {
        state: item.state,
        createdAt: item.createdAt ?? item.updatedAt,
        updatedAt: item.updatedAt,
        folderId: item.folderId,
      },
      scope,
    );
  }

  for (const item of snapshot.savedTables) {
    await addSavedTable(
      {
        normalizedName: item.normalizedName,
        name: item.name,
        state: item.state,
        createdAt: item.createdAt ?? item.updatedAt,
        updatedAt: item.updatedAt,
        folderId: item.folderId,
      },
      scope,
    );
  }

  for (const item of snapshot.savedDrafts) {
    const nextDraft: SavedTableDraftRecord = {
      tableName: item.tableName,
      state: item.state,
      updatedAt: item.updatedAt,
      baseSignature: item.baseSignature,
    };
    await upsertSavedDraft(item.normalizedName, nextDraft, scope);
  }

  if (snapshot.folders.length > 0) {
    await bulkPutFolders(snapshot.folders, scope);
  }
};

export const applyCloudSnapshotToLocal = async (
  snapshot: WorkspaceSnapshot,
  options: {
    overwrite?: boolean;
    scope: WorkspaceScope;
  },
) => {
  const { scope } = options;

  if (options.overwrite) {
    await replaceLocalWorkspaceSnapshot(snapshot, scope);
    dispatchWorkspaceSnapshotApplied();
    return;
  }

  const localGlobalDraft = await readDraft(DEFAULT_DRAFT_ID, scope);
  if (
    snapshot.globalDraft &&
    (!localGlobalDraft || localGlobalDraft.updatedAt < snapshot.globalDraft.updatedAt)
  ) {
    await writeDraft(DEFAULT_DRAFT_ID, snapshot.globalDraft, scope);
  }

  for (const item of snapshot.drafts) {
    const existing = await readDraft(item.draftId, scope);
    if (existing && existing.updatedAt > item.updatedAt) {
      continue;
    }

    await writeDraft(
      item.draftId,
      {
        state: item.state,
        createdAt: item.createdAt ?? item.updatedAt,
        updatedAt: item.updatedAt,
        folderId: item.folderId,
      },
      scope,
    );
  }

  for (const item of snapshot.savedTables) {
    await upsertLocalSavedTable({ ...item }, scope);
  }

  const localSavedDrafts = await listSavedDrafts(scope);
  for (const item of snapshot.savedDrafts) {
    const existing = localSavedDrafts[item.normalizedName];
    if (existing && existing.updatedAt > item.updatedAt) {
      continue;
    }

    await upsertSavedDraft(
      item.normalizedName,
      {
        tableName: item.tableName,
        state: item.state,
        updatedAt: item.updatedAt,
        baseSignature: item.baseSignature,
      },
      scope,
    );
  }

  await clearFolders(scope);
  if (snapshot.folders.length > 0) {
    await bulkPutFolders(snapshot.folders, scope);
  }

  dispatchWorkspaceSnapshotApplied();
};
