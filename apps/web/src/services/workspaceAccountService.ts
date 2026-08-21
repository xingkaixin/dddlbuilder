import type { WorkspaceScope } from '@ddlbuilder/shared-types';
import type { ApiErrorPayload, WorkspaceListResponse } from '@ddlbuilder/shared-types/api';
import { deleteSavedTable, listSavedTables, listTrashedSavedTables } from '@/utils/savedTablesDb';
import { clearFolders } from '@/utils/tableFolders';
import {
  clearWorkspaceSession,
  deleteDraft,
  deleteSavedDraft,
  listDrafts,
  listSavedDrafts,
  listTrashedDrafts,
} from '@/utils/workspaceStateDb';
import { dispatchWorkspaceSnapshotApplied } from './workspaceSyncService';
import { ApiError } from '@/services/apiError';

const readJsonSafely = async <T>(response: Response): Promise<T | null> =>
  (await response.json().catch(() => null)) as T | null;

export const fetchWorkspaceList = async (signal?: AbortSignal): Promise<WorkspaceListResponse> => {
  const response = await fetch('/api/workspaces', { credentials: 'include', signal });
  const payload = await readJsonSafely<WorkspaceListResponse | ApiErrorPayload>(response);
  if (!response.ok) {
    const message = payload && 'error' in payload ? payload.error : '工作区列表拉取失败';
    throw new ApiError(message, response.status);
  }
  if (!payload || !('activeWorkspaceId' in payload)) {
    throw new Error('工作区列表响应为空');
  }
  return payload;
};

export const clearLocalWorkspaceData = async (scope: WorkspaceScope): Promise<void> => {
  if (scope.kind !== 'user' || !scope.workspaceId) return;

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

  dispatchWorkspaceSnapshotApplied();
};
