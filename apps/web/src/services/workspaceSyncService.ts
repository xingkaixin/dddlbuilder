import type { PersistedState } from '@ddlbuilder/shared-types';
import type {
  ApiErrorPayload,
  WorkspaceSnapshotPushRequest,
  WorkspaceSnapshotResponse,
} from '@ddlbuilder/shared-types/api';
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
import { listFolders, clearFolders, bulkPutFolders } from '@/utils/tableFolders';
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
import { getCurrentWorkspaceScope } from '@/utils/workspaceScope';

export const WORKSPACE_SNAPSHOT_APPLIED_EVENT = 'ddlbuilder:workspace-snapshot-applied';

const toErrorMessage = (payload: ApiErrorPayload | null, fallback: string) =>
  payload && typeof payload.error === 'string' ? payload.error : fallback;

const readJsonSafely = async <T>(response: Response): Promise<T | null> => {
  return (await response.json().catch(() => null)) as T | null;
};

const normalizeState = (value: Record<string, unknown>): PersistedState => value as PersistedState;

const upsertLocalSavedTable = async (input: {
  normalizedName: string;
  name: string;
  state: PersistedState;
  createdAt?: number;
  updatedAt: number;
  folderId?: string;
}) => {
  const scope = getCurrentWorkspaceScope();
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

export const pullWorkspaceSnapshot = async (): Promise<WorkspaceSnapshot> => {
  const response = await fetch('/api/workspace/snapshot', {
    credentials: 'include',
  });

  const payload = await readJsonSafely<WorkspaceSnapshotResponse | ApiErrorPayload>(response);
  if (!response.ok) {
    throw new Error(toErrorMessage(payload as ApiErrorPayload | null, '工作区云端拉取失败'));
  }

  const snapshot = payload as WorkspaceSnapshotResponse | null;
  const result = {
    globalDraft: snapshot?.globalDraft
      ? {
          state: normalizeState(snapshot.globalDraft.state),
          updatedAt: snapshot.globalDraft.updatedAt,
        }
      : null,
    drafts: (snapshot?.drafts ?? []).map((item) => ({
      draftId: item.draftId,
      state: normalizeState(item.state),
      createdAt: item.createdAt ?? item.updatedAt,
      updatedAt: item.updatedAt,
      folderId: item.folderId,
    })),
    savedTables: (snapshot?.savedTables ?? []).map((item) => ({
      normalizedName: item.normalizedName,
      name: item.name,
      state: normalizeState(item.state),
      createdAt: item.createdAt ?? item.updatedAt,
      updatedAt: item.updatedAt,
      folderId: item.folderId,
    })),
    savedDrafts: (snapshot?.savedDrafts ?? []).map((item) => ({
      normalizedName: item.normalizedName,
      tableName: item.tableName,
      state: normalizeState(item.state),
      updatedAt: item.updatedAt,
      baseSignature: item.baseSignature,
    })),
    folders: snapshot?.folders ?? [],
  };
  return result;
};

export const collectWorkspaceSnapshot = async (
  overrides?: Partial<WorkspaceSnapshot>,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<WorkspaceSnapshotPushRequest> => {
  const [localGlobalDraft, localDrafts, localSavedTables, localSavedDraftMap, localFolders] =
    await Promise.all([
      readDraft(DEFAULT_DRAFT_ID, scope),
      listDrafts(scope),
      listSavedTables(scope),
      listSavedDrafts(scope),
      listFolders(scope),
    ]);

  const savedDrafts = Object.entries(localSavedDraftMap).map(([normalizedName, item]) => ({
    normalizedName,
    tableName: item.tableName,
    state: item.state,
    updatedAt: item.updatedAt,
    baseSignature: item.baseSignature,
  }));

  return {
    globalDraft: overrides?.globalDraft ?? localGlobalDraft,
    drafts: overrides?.drafts ?? localDrafts.map(({ draftId, record }) => ({ draftId, ...record })),
    savedTables: overrides?.savedTables ?? localSavedTables,
    savedDrafts: overrides?.savedDrafts ?? savedDrafts,
    folders: overrides?.folders ?? localFolders,
  };
};

export const pushWorkspaceSnapshot = async (snapshot?: WorkspaceSnapshotPushRequest) => {
  const body = snapshot ?? (await collectWorkspaceSnapshot());
  const response = await fetch('/api/workspace/snapshot', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  const payload = await readJsonSafely<ApiErrorPayload>(response);
  if (!response.ok) {
    throw new Error(toErrorMessage(payload, '工作区云端同步失败'));
  }
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
    scope?: WorkspaceScope;
  } = {},
) => {
  const scope = options.scope ?? getCurrentWorkspaceScope();

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
    await upsertLocalSavedTable({ ...item });
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

export const exportWorkspaceToCloud = async (
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
) => {
  const snapshot = await collectWorkspaceSnapshot(undefined, scope);
  await pushWorkspaceSnapshot(snapshot);
};

export const importWorkspaceFromCloud = async (
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
) => {
  const snapshot = await pullWorkspaceSnapshot();
  await applyCloudSnapshotToLocal(snapshot, {
    overwrite: true,
    scope,
  });
};
