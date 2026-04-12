import type { PersistedState } from '@/types';
import type {
  ApiErrorPayload,
  WorkspaceSnapshotPushRequest,
  WorkspaceSnapshotResponse,
} from '@/types/api';
import type { SavedTableDraftRecord, WorkspaceSnapshot } from '@/types/workspace';
import {
  addSavedTable,
  getSavedTable,
  listSavedTables,
  updateSavedTable,
} from '@/utils/savedTablesDb';
import {
  clearGlobalDraft,
  listSavedDrafts,
  readGlobalDraft,
  readWorkspaceSession,
  upsertSavedDraft,
  writeGlobalDraft,
  writeWorkspaceSession,
} from '@/utils/workspaceStateDb';

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
  const existing = await getSavedTable(input.normalizedName);
  if (existing) {
    if (existing.updatedAt > input.updatedAt) {
      return;
    }
    await updateSavedTable({
      ...existing,
      name: input.name,
      state: input.state,
      updatedAt: input.updatedAt,
    });
    return;
  }

  await addSavedTable({
    normalizedName: input.normalizedName,
    name: input.name,
    state: input.state,
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
  });
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
): Promise<WorkspaceSnapshotPushRequest> => {
  const [localGlobalDraft, localSavedTables, localSavedDraftMap] = await Promise.all([
    readGlobalDraft(),
    listSavedTables(),
    listSavedDrafts(),
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

export const applyCloudSnapshotToLocal = async (snapshot: WorkspaceSnapshot) => {
  const localGlobalDraft = await readGlobalDraft();
  if (snapshot.globalDraft) {
    if (!localGlobalDraft || localGlobalDraft.updatedAt < snapshot.globalDraft.updatedAt) {
      await writeGlobalDraft(snapshot.globalDraft);
    }
  } else if (!localGlobalDraft) {
    await clearGlobalDraft();
  }

  for (const item of snapshot.savedTables) {
    await upsertLocalSavedTable(item);
  }

  const currentSession = await readWorkspaceSession();
  if (currentSession?.activeSource.kind === 'saved_table') {
    const matchedTable = snapshot.savedTables.find(
      (item) => item.normalizedName === currentSession.activeSource.normalizedName,
    );
    if (matchedTable && currentSession.updatedAt < matchedTable.updatedAt) {
      await writeWorkspaceSession({
        ...currentSession,
        activeSource: {
          kind: 'saved_table',
          normalizedName: matchedTable.normalizedName,
          tableName: matchedTable.name,
          baseSignature: JSON.stringify(matchedTable.state),
        },
        updatedAt: matchedTable.updatedAt,
      });
    }
  }

  const localSavedDrafts = await listSavedDrafts();
  for (const item of snapshot.savedDrafts) {
    const existing = localSavedDrafts[item.normalizedName];
    if (existing && existing.updatedAt > item.updatedAt) {
      continue;
    }

    const nextDraft: SavedTableDraftRecord = {
      tableName: item.tableName,
      state: item.state,
      updatedAt: item.updatedAt,
      baseSignature: item.baseSignature,
    };
    await upsertSavedDraft(item.normalizedName, nextDraft);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WORKSPACE_SNAPSHOT_APPLIED_EVENT));
  }
};
