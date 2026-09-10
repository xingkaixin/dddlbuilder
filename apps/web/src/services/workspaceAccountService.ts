import {
  decodeApiError,
  decodeCurrentWorkspaceResponse,
} from '@ddlbuilder/shared-types/api-contracts';
import {
  forgetWorkspaceCache,
  markWorkspaceCleanupPending,
  readWorkspaceCaches,
} from './workspaceCacheRegistry';
import {
  parseWorkspaceIdentity,
  readWorkspaceIdentity,
  writeWorkspaceIdentity,
} from './workspaceIdentity';
import { clearWorkspaceHistory } from './workspaceHistoryCleanup';
import type { WorkspaceScope } from '@ddlbuilder/shared-types';
import type { CurrentWorkspaceResponseWithMeta } from '@ddlbuilder/shared-types/api';
import { deleteSavedTable, listSavedTables, listTrashedSavedTables } from '@/utils/savedTablesDb';
import { clearFolders } from '@/utils/tableFolders';
import {
  clearWorkspaceSession,
  deleteDraft,
  deleteSavedDraft,
  listDrafts,
  listSavedDrafts,
  listTrashedDrafts,
  readWorkspaceSession,
  writeWorkspaceSession,
} from '@/utils/workspaceStateDb';
import { dispatchWorkspaceSnapshotApplied } from './workspaceSyncService';
import { ApiError } from '@/services/apiError';
import { clearWorkspaceYDocData } from './workspaceYDocStorage';

export const fetchCurrentWorkspace = async (
  signal?: AbortSignal,
): Promise<CurrentWorkspaceResponseWithMeta> => {
  const response = await fetch('/api/workspaces', { credentials: 'include', signal });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = decodeApiError(payload);
    throw new ApiError(error.error ?? '工作区获取失败', response.status, error.code);
  }

  const decoded = decodeCurrentWorkspaceResponse(payload);

  if (decoded._tag === 'None') throw new Error('工作区响应为空');

  return decoded.value;
};

const clearWorkspacePartition = async (scope: WorkspaceScope): Promise<void> => {
  const [drafts, trashedDrafts, savedTables, trashedSavedTables, savedDrafts] = await Promise.all([
    listDrafts(scope),
    listTrashedDrafts(scope),
    listSavedTables(scope),
    listTrashedSavedTables(scope),
    listSavedDrafts(scope),
  ]);

  await Promise.all([
    clearWorkspaceSession(scope),
    clearFolders(scope),
    ...drafts.map((item) => deleteDraft(item.draftId, scope)),
    ...trashedDrafts.map((item) => deleteDraft(item.draftId, scope)),
    ...savedTables.map((item) => deleteSavedTable(item.normalizedName, scope)),
    ...trashedSavedTables.map((item) => deleteSavedTable(item.normalizedName, scope)),
    ...Object.keys(savedDrafts).map((normalizedName) => deleteSavedDraft(normalizedName, scope)),
  ]);
};

export const clearLegacyWorkspaceData = async (scope: WorkspaceScope): Promise<void> => {
  if (scope.kind !== 'user') return;
  const session = await readWorkspaceSession(scope);
  await clearWorkspacePartition(scope);
  await clearWorkspacePartition({ kind: 'legacy_user', userId: scope.userId });

  if (session) {
    await writeWorkspaceSession(
      { activeSource: session.activeSource, updatedAt: session.updatedAt },
      scope,
    );
  }
};

export const clearLocalWorkspaceData = async (scope: WorkspaceScope): Promise<void> => {
  if (scope.kind !== 'user') return;
  const scopes = markWorkspaceCleanupPending(scope);

  for (const cachedScope of scopes) {
    await clearWorkspaceYDocData(cachedScope.workspaceId);
    await clearWorkspacePartition(cachedScope);
    await clearWorkspaceHistory(cachedScope);
  }

  await clearWorkspacePartition({ kind: 'legacy_user', userId: scope.userId });
  await clearWorkspaceHistory({ kind: 'legacy_user', userId: scope.userId });

  for (const cachedScope of scopes) forgetWorkspaceCache(cachedScope);
  dispatchWorkspaceSnapshotApplied();
};

let pendingCleanup: Promise<void> | null = null;
export const retryPendingWorkspaceCleanup = (): Promise<void> => {
  if (pendingCleanup) return pendingCleanup;
  pendingCleanup = (async () => {
    const scopes = readWorkspaceCaches().filter((cache) => cache.status === 'pending_cleanup');
    const users = new Set<string>();

    for (const scope of scopes) {
      if (users.has(scope.userId)) continue;
      users.add(scope.userId);
      await clearLocalWorkspaceData(scope);

      if (parseWorkspaceIdentity(readWorkspaceIdentity())?.userId === scope.userId)
        writeWorkspaceIdentity(null);
    }
  })().finally(() => {
    pendingCleanup = null;
  });

  return pendingCleanup;
};
