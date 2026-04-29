import type { PersistedState } from '@ddlbuilder/shared-types';
import type { ApiErrorPayload, WorkspaceMigrationResponse } from '@ddlbuilder/shared-types/api';
import type { WorkspaceScope, WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import { applyCloudSnapshotToLocal } from '@/services/workspaceSyncService';
import { listSavedTables } from '@/utils/savedTablesDb';
import { listFolders } from '@/utils/tableFolders';
import {
  listDrafts,
  listSavedDrafts,
  readGlobalDraft,
  readWorkspaceSession,
} from '@/utils/workspaceStateDb';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';

export type WorkspaceMigrationSnapshot = {
  globalDraft: {
    state: PersistedState;
    updatedAt: number;
  } | null;
  activeSession: {
    activeSource: WorkspaceSource;
    activeState: PersistedState | null;
    updatedAt: number;
  } | null;
  savedTables: Array<{
    normalizedName: string;
    name: string;
    state: PersistedState;
    updatedAt: number;
    folderId?: string;
  }>;
  drafts: Array<{
    draftId: string;
    state: PersistedState;
    updatedAt: number;
    folderId?: string;
  }>;
  savedDrafts: Array<{
    normalizedName: string;
    tableName: string;
    state: PersistedState;
    updatedAt: number;
    baseSignature: string;
  }>;
  folders: Array<{
    id: string;
    name: string;
    parentId?: string;
    order: number;
    createdAt: number;
  }>;
};

export type WorkspaceMigrationPayload = {
  localFingerprint: string;
  idempotencyKey: string;
  snapshot: WorkspaceMigrationSnapshot;
};

const isPersistedStateTrivial = (state: PersistedState): boolean =>
  !state.rows?.some((row) => row.fieldName?.trim());

export const hasMeaningfulWorkspaceSnapshotData = (snapshot: WorkspaceMigrationSnapshot | null) =>
  Boolean(snapshot?.globalDraft && !isPersistedStateTrivial(snapshot.globalDraft.state)) ||
  Boolean(
    snapshot?.activeSession?.activeState &&
    !isPersistedStateTrivial(snapshot.activeSession.activeState),
  ) ||
  Boolean(snapshot && snapshot.drafts.length > 0) ||
  Boolean(snapshot && snapshot.savedTables.length > 0) ||
  Boolean(snapshot && snapshot.savedDrafts.length > 0) ||
  Boolean(snapshot && snapshot.folders.length > 0);

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
  const [globalDraft, activeSession, drafts, savedTables, savedDraftMap, folders] =
    await Promise.all([
      readGlobalDraft(scope),
      readWorkspaceSession(scope),
      listDrafts(scope),
      listSavedTables(scope),
      listSavedDrafts(scope),
      listFolders(),
    ]);

  const savedDrafts = Object.entries(savedDraftMap).map(([normalizedName, item]) => ({
    normalizedName,
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
    drafts.some((item) => item.draftId !== 'default') ||
    savedTables.length > 0 ||
    savedDrafts.length > 0 ||
    folders.length > 0;

  if (!hasData) {
    return null;
  }

  const snapshot: WorkspaceMigrationSnapshot = {
    globalDraft: meaningfulGlobalDraft,
    activeSession: activeSession ? { ...activeSession, activeState: meaningfulActiveState } : null,
    drafts: drafts
      .filter((item) => item.draftId !== 'default')
      .map(({ draftId, record }) => ({ draftId, ...record })),
    savedTables: savedTables.map((item) => ({
      normalizedName: item.normalizedName,
      name: item.name,
      state: item.state,
      updatedAt: item.updatedAt,
      folderId: item.folderId,
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
    {
      overwrite: true,
      scope,
    },
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
