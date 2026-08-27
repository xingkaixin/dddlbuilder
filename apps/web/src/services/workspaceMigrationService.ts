import type { SchemaDocumentState } from '@ddlbuilder/shared-types';
import type { ApiErrorPayload, WorkspaceMigrationResponse } from '@ddlbuilder/shared-types/api';
import type {
  WorkspaceMigrationPayload,
  WorkspaceMigrationSnapshot,
  WorkspaceScope,
  WorkspaceSnapshot,
  UserWorkspaceScope,
} from '@ddlbuilder/shared-types/workspace';
import { shouldAcceptSnapshotRecord } from '@ddlbuilder/workspace-core';
import {
  applyCloudSnapshotToLocal,
  dispatchWorkspaceSnapshotApplied,
} from '@/services/workspaceSyncService';
import {
  addSavedTable,
  getSavedTable,
  listSavedTables,
  listTrashedSavedTables,
  updateSavedTable,
} from '@/utils/savedTablesDb';
import { bulkPutFolders, listFolders } from '@/utils/tableFolders';
import {
  DEFAULT_DRAFT_ID,
  listDrafts,
  listSavedDrafts,
  listTrashedDrafts,
  readDraft,
  readSavedDraft,
  readWorkspaceSession,
  upsertSavedDraft,
  writeDraft,
  writeWorkspaceSession,
} from '@/utils/workspaceStateDb';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';

export type { WorkspaceMigrationPayload } from '@ddlbuilder/shared-types/workspace';

const isPersistedStateTrivial = (state: SchemaDocumentState): boolean =>
  !state.rows?.some((row) => row.fieldName?.trim());

const stripUpdatedAtFromSnapshot = (snapshot: WorkspaceMigrationSnapshot) => ({
  globalDraft: snapshot.globalDraft ? { state: snapshot.globalDraft.state } : null,
  activeSession: snapshot.activeSession
    ? {
        activeSource: snapshot.activeSession.activeSource,
        activeState: snapshot.activeSession.activeState,
      }
    : null,
  drafts: snapshot.drafts.map(({ updatedAt: _, ...rest }) => rest),
  savedTables: snapshot.savedTables.map(({ updatedAt: _, ...rest }) => rest),
  savedDrafts: snapshot.savedDrafts.map(({ updatedAt: _, ...rest }) => rest),
  folders: snapshot.folders,
});

const WORKSPACE_MIGRATION_DISMISS_PREFIX = 'ddlbuilder:workspace-migration:dismissed';

const buildDismissKey = (appUserId: string, fingerprint: string) =>
  `${WORKSPACE_MIGRATION_DISMISS_PREFIX}:${appUserId}:${fingerprint}`;

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

const requestWorkspaceMigration = async (
  mode: 'analyze' | 'commit',
  payload: WorkspaceMigrationPayload,
): Promise<WorkspaceMigrationResponse> => {
  const response = await fetch('/api/workspace/migrations', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      mode,
      payload,
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | WorkspaceMigrationResponse
    | ApiErrorPayload
    | null;

  if (!response.ok) {
    throw new Error(
      data && 'error' in data && typeof data.error === 'string' ? data.error : '迁移失败',
    );
  }

  if (!data || !('status' in data)) {
    throw new Error('迁移响应无效');
  }

  return data;
};

export const collectWorkspaceMigrationPayload = async (
  scope: WorkspaceScope = getAnonymousWorkspaceScope(),
): Promise<WorkspaceMigrationPayload | null> => {
  const [
    globalDraft,
    activeSession,
    drafts,
    trashedDrafts,
    savedTables,
    trashedTables,
    savedDraftMap,
    folders,
  ] = await Promise.all([
    readDraft(DEFAULT_DRAFT_ID, scope),
    readWorkspaceSession(scope),
    listDrafts(scope),
    listTrashedDrafts(scope),
    listSavedTables(scope),
    listTrashedSavedTables(scope),
    listSavedDrafts(scope),
    listFolders(scope),
  ]);

  const savedDrafts = Object.entries(savedDraftMap).map(([normalizedName, item]) => ({
    normalizedName,
    tableId: item.tableId,
    tableName: item.tableName,
    state: item.state,
    updatedAt: item.updatedAt,
    baseSignature: item.baseSignature,
  }));

  const meaningfulGlobalDraft =
    globalDraft && !isPersistedStateTrivial(globalDraft.state) ? globalDraft : null;
  const meaningfulActiveState =
    activeSession?.activeState && !isPersistedStateTrivial(activeSession.activeState)
      ? activeSession.activeState
      : null;

  const hasData =
    Boolean(meaningfulGlobalDraft) ||
    Boolean(meaningfulActiveState) ||
    drafts.some((item) => item.draftId !== DEFAULT_DRAFT_ID) ||
    trashedDrafts.length > 0 ||
    savedTables.length > 0 ||
    trashedTables.length > 0 ||
    savedDrafts.length > 0 ||
    folders.length > 0;

  if (!hasData) {
    return null;
  }

  const snapshot: WorkspaceMigrationSnapshot = {
    globalDraft: meaningfulGlobalDraft,
    activeSession: activeSession ? { ...activeSession, activeState: meaningfulActiveState } : null,
    drafts: [...drafts, ...trashedDrafts]
      .filter((item) => item.draftId !== DEFAULT_DRAFT_ID)
      .map(({ draftId, record }) => ({ draftId, ...record })),
    savedTables: [...savedTables, ...trashedTables].map((item) => ({
      tableId: item.tableId,
      normalizedName: item.normalizedName,
      name: item.name,
      state: item.state,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      folderId: item.folderId,
      trashedAt: item.trashedAt,
    })),
    savedDrafts,
    folders,
  };

  const contentForHash = stripUpdatedAtFromSnapshot(snapshot);
  const encoded = new TextEncoder().encode(JSON.stringify(contentForHash));
  const digest = await crypto.subtle.digest('SHA-256', encoded);

  return {
    localFingerprint: toHex(digest),
    idempotencyKey: crypto.randomUUID(),
    snapshot,
  };
};

// 提升可能重跑（上次中途失败），也可能与云端拉取并发，所以逐条按 updatedAt 判断：
// 目标分区缺失或更旧才写入。用“目标分区是否为空”当作“是否已提升过”会漏提升剩余数据。
const shouldPromoteRecord = shouldAcceptSnapshotRecord;

export const promoteLegacyUserWorkspaceData = async (
  scope: UserWorkspaceScope,
): Promise<boolean> => {
  const legacyScope: WorkspaceScope = {
    kind: 'legacy_user',
    userId: scope.userId,
  };
  const [drafts, trashedDrafts, savedTables, trashedTables, savedDrafts, folders, session] =
    await Promise.all([
      listDrafts(legacyScope),
      listTrashedDrafts(legacyScope),
      listSavedTables(legacyScope),
      listTrashedSavedTables(legacyScope),
      listSavedDrafts(legacyScope),
      listFolders(legacyScope),
      readWorkspaceSession(legacyScope),
    ]);

  if (
    drafts.length === 0 &&
    trashedDrafts.length === 0 &&
    savedTables.length === 0 &&
    trashedTables.length === 0 &&
    Object.keys(savedDrafts).length === 0 &&
    folders.length === 0
  ) {
    return false;
  }

  for (const { draftId, record } of [...drafts, ...trashedDrafts]) {
    const existing = await readDraft(draftId, scope);
    if (shouldPromoteRecord(record.updatedAt, existing?.updatedAt)) {
      await writeDraft(draftId, record, scope);
    }
  }

  for (const table of [...savedTables, ...trashedTables]) {
    const existing = await getSavedTable(table.normalizedName, scope);
    if (!existing) {
      await addSavedTable(table, scope);
    } else if (shouldPromoteRecord(table.updatedAt, existing.updatedAt)) {
      await updateSavedTable(table, scope);
    }
  }

  for (const [normalizedName, draft] of Object.entries(savedDrafts)) {
    const existing = await readSavedDraft(normalizedName, scope);
    if (shouldPromoteRecord(draft.updatedAt, existing?.updatedAt)) {
      await upsertSavedDraft(normalizedName, draft, scope);
    }
  }

  const targetFolders = new Map((await listFolders(scope)).map((folder) => [folder.id, folder]));
  const foldersToPromote = folders.filter((folder) =>
    shouldPromoteRecord(folder.updatedAt, targetFolders.get(folder.id)?.updatedAt),
  );
  if (foldersToPromote.length > 0) {
    await bulkPutFolders(foldersToPromote, scope);
  }

  const targetSession = await readWorkspaceSession(scope);
  if (session && shouldPromoteRecord(session.updatedAt, targetSession?.updatedAt)) {
    await writeWorkspaceSession(session, scope);
  }

  dispatchWorkspaceSnapshotApplied();
  return true;
};

const migrationSnapshotToWorkspaceSnapshot = (
  snapshot: WorkspaceMigrationSnapshot,
): WorkspaceSnapshot => {
  const drafts = [...snapshot.drafts];
  const activeSession = snapshot.activeSession;
  const activeSource = activeSession?.activeSource;
  if (activeSession?.activeState && activeSource?.kind === 'draft') {
    const existingIndex = drafts.findIndex((draft) => draft.draftId === activeSource.draftId);
    const draft = {
      draftId: activeSource.draftId,
      state: activeSession.activeState,
      updatedAt: activeSession.updatedAt,
    };
    if (existingIndex >= 0) {
      drafts[existingIndex] = { ...drafts[existingIndex], ...draft };
    } else {
      drafts.push(draft);
    }
  }

  return {
    globalDraft: snapshot.globalDraft,
    drafts,
    savedTables: snapshot.savedTables,
    savedDrafts: snapshot.savedDrafts,
    folders: snapshot.folders,
  };
};

// 先把 legacy `user:U` 分区提升到目标分区，再读取；顺序颠倒会让本次会话漏掉刚提升的数据。
export const prepareLegacyWorkspaceSnapshot = async (
  scope: UserWorkspaceScope,
): Promise<WorkspaceSnapshot | null> => {
  await promoteLegacyUserWorkspaceData(scope);
  const payload = await collectWorkspaceMigrationPayload(scope);
  return payload ? migrationSnapshotToWorkspaceSnapshot(payload.snapshot) : null;
};

export const analyzeWorkspaceMigration = async () => {
  const payload = await collectWorkspaceMigrationPayload(getAnonymousWorkspaceScope());
  if (!payload) {
    return null;
  }

  const result = await requestWorkspaceMigration('analyze', payload);
  return {
    payload,
    result,
  };
};

export const hasMeaningfulWorkspaceData = async (
  scope: WorkspaceScope = getAnonymousWorkspaceScope(),
) => {
  const payload = await collectWorkspaceMigrationPayload(scope);
  return payload != null;
};

export const commitWorkspaceMigration = async (payload: WorkspaceMigrationPayload) =>
  requestWorkspaceMigration('commit', payload);

export const applyWorkspaceMigrationPayloadToLocal = async (
  payload: WorkspaceMigrationPayload,
  scope: WorkspaceScope,
) => {
  await applyCloudSnapshotToLocal(
    {
      globalDraft: payload.snapshot.globalDraft,
      drafts: payload.snapshot.drafts,
      savedTables: payload.snapshot.savedTables,
      savedDrafts: payload.snapshot.savedDrafts,
      folders: payload.snapshot.folders,
    },
    { scope },
  );
};

export const dismissWorkspaceMigration = (appUserId: string, fingerprint: string) => {
  localStorage.setItem(buildDismissKey(appUserId, fingerprint), '1');
};

export const isWorkspaceMigrationDismissed = (appUserId: string, fingerprint: string) =>
  localStorage.getItem(buildDismissKey(appUserId, fingerprint)) === '1';

export const clearWorkspaceMigrationDismissed = (appUserId: string, fingerprint: string) => {
  localStorage.removeItem(buildDismissKey(appUserId, fingerprint));
};
