import type { PersistedState } from '@/types';
import type { ApiErrorPayload, WorkspaceMigrationResponse } from '@/types/api';
import type { WorkspaceSource } from '@/types/workspace';
import { listSavedTables } from '@/utils/savedTablesDb';
import { listSavedDrafts, readGlobalDraft, readWorkspaceSession } from '@/utils/workspaceStateDb';

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
  }>;
  savedDrafts: Array<{
    normalizedName: string;
    tableName: string;
    state: PersistedState;
    updatedAt: number;
    baseSignature: string;
  }>;
};

export type WorkspaceMigrationPayload = {
  localFingerprint: string;
  idempotencyKey: string;
  snapshot: WorkspaceMigrationSnapshot;
};

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

export const collectWorkspaceMigrationPayload =
  async (): Promise<WorkspaceMigrationPayload | null> => {
    const [globalDraft, activeSession, savedTables, savedDraftMap] = await Promise.all([
      readGlobalDraft(),
      readWorkspaceSession(),
      listSavedTables(),
      listSavedDrafts(),
    ]);

    const savedDrafts = Object.entries(savedDraftMap).map(([normalizedName, item]) => ({
      normalizedName,
      tableName: item.tableName,
      state: item.state,
      updatedAt: item.updatedAt,
      baseSignature: item.baseSignature,
    }));

    const hasData =
      Boolean(globalDraft) ||
      Boolean(activeSession?.activeState) ||
      savedTables.length > 0 ||
      savedDrafts.length > 0;

    if (!hasData) {
      return null;
    }

    const snapshot: WorkspaceMigrationSnapshot = {
      globalDraft,
      activeSession,
      savedTables: savedTables.map((item) => ({
        normalizedName: item.normalizedName,
        name: item.name,
        state: item.state,
        updatedAt: item.updatedAt,
      })),
      savedDrafts,
    };

    const encoded = new TextEncoder().encode(JSON.stringify(snapshot));
    const digest = await crypto.subtle.digest('SHA-256', encoded);

    return {
      localFingerprint: toHex(digest),
      idempotencyKey: crypto.randomUUID(),
      snapshot,
    };
  };

export const analyzeWorkspaceMigration = async () => {
  const payload = await collectWorkspaceMigrationPayload();
  if (!payload) {
    return null;
  }

  const result = await requestWorkspaceMigration('analyze', payload);
  return {
    payload,
    result,
  };
};

export const commitWorkspaceMigration = async (payload: WorkspaceMigrationPayload) =>
  requestWorkspaceMigration('commit', payload);

export const dismissWorkspaceMigration = (appUserId: string, fingerprint: string) => {
  localStorage.setItem(buildDismissKey(appUserId, fingerprint), '1');
};

export const isWorkspaceMigrationDismissed = (appUserId: string, fingerprint: string) =>
  localStorage.getItem(buildDismissKey(appUserId, fingerprint)) === '1';

export const clearWorkspaceMigrationDismissed = (appUserId: string, fingerprint: string) => {
  localStorage.removeItem(buildDismissKey(appUserId, fingerprint));
};
