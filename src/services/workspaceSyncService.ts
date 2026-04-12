import type { PersistedState } from '@/types';
import type {
  ApiErrorPayload,
  WorkspaceSnapshotPushRequest,
  WorkspaceSnapshotResponse,
} from '@/types/api';
import type { SavedTableDraftRecord, WorkspaceScope, WorkspaceSnapshot } from '@/types/workspace';
import {
  addSavedTable,
  deleteSavedTable,
  getSavedTable,
  listSavedTables,
  updateSavedTable,
} from '@/utils/savedTablesDb';
import {
  clearGlobalDraft,
  clearWorkspaceSession,
  deleteSavedDraft,
  listSavedDrafts,
  readGlobalDraft,
  upsertSavedDraft,
  writeGlobalDraft,
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
  updatedAt: number;
}) => {
  const scope = getCurrentWorkspaceScope();
  const existing = await getSavedTable(input.normalizedName, scope);
  if (existing) {
    if (existing.updatedAt > input.updatedAt) {
      return;
    }
    await updateSavedTable({
      ...existing,
      name: input.name,
      state: input.state,
      updatedAt: input.updatedAt,
    }, scope);
    return;
  }

  await addSavedTable({
    normalizedName: input.normalizedName,
    name: input.name,
    state: input.state,
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
  }, scope);
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
  return {
    globalDraft: snapshot?.globalDraft
      ? {
          state: normalizeState(snapshot.globalDraft.state),
          updatedAt: snapshot.globalDraft.updatedAt,
        }
      : null,
    savedTables: (snapshot?.savedTables ?? []).map((item) => ({
      normalizedName: item.normalizedName,
      name: item.name,
      state: normalizeState(item.state),
      updatedAt: item.updatedAt,
    })),
    savedDrafts: (snapshot?.savedDrafts ?? []).map((item) => ({
      normalizedName: item.normalizedName,
      tableName: item.tableName,
      state: normalizeState(item.state),
      updatedAt: item.updatedAt,
      baseSignature: item.baseSignature,
    })),
  };
};

export const collectWorkspaceSnapshot = async (
  overrides?: Partial<WorkspaceSnapshot>,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<WorkspaceSnapshotPushRequest> => {
  const [localGlobalDraft, localSavedTables, localSavedDraftMap] = await Promise.all([
    readGlobalDraft(scope),
    listSavedTables(scope),
    listSavedDrafts(scope),
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
    savedTables: overrides?.savedTables ?? localSavedTables,
    savedDrafts: overrides?.savedDrafts ?? savedDrafts,
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

const dispatchWorkspaceSnapshotApplied = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WORKSPACE_SNAPSHOT_APPLIED_EVENT));
  }
};

const replaceLocalWorkspaceSnapshot = async (
  snapshot: WorkspaceSnapshot,
  scope: WorkspaceScope,
) => {
  const [localSavedTables, localSavedDrafts] = await Promise.all([
    listSavedTables(scope),
    listSavedDrafts(scope),
  ]);

  await clearGlobalDraft(scope);
  await clearWorkspaceSession(scope);

  await Promise.all([
    ...localSavedTables.map((item) => deleteSavedTable(item.normalizedName, scope)),
    ...Object.keys(localSavedDrafts).map((normalizedName) => deleteSavedDraft(normalizedName, scope)),
  ]);

  if (snapshot.globalDraft) {
    await writeGlobalDraft(snapshot.globalDraft, scope);
  }

  for (const item of snapshot.savedTables) {
    await addSavedTable(
      {
        normalizedName: item.normalizedName,
        name: item.name,
        state: item.state,
        createdAt: item.updatedAt,
        updatedAt: item.updatedAt,
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

  const localGlobalDraft = await readGlobalDraft(scope);
  if (snapshot.globalDraft && (!localGlobalDraft || localGlobalDraft.updatedAt < snapshot.globalDraft.updatedAt)) {
    await writeGlobalDraft(snapshot.globalDraft, scope);
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

  dispatchWorkspaceSnapshotApplied();
};

export const exportWorkspaceToCloud = async (scope: WorkspaceScope = getCurrentWorkspaceScope()) => {
  const snapshot = await collectWorkspaceSnapshot(undefined, scope);
  await pushWorkspaceSnapshot(snapshot);
};

export const importWorkspaceFromCloud = async (scope: WorkspaceScope = getCurrentWorkspaceScope()) => {
  const snapshot = await pullWorkspaceSnapshot();
  await applyCloudSnapshotToLocal(snapshot, {
    overwrite: true,
    scope,
  });
};
