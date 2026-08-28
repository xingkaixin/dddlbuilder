import type {
  SavedTableDraftRecord,
  WorkspaceScope,
  WorkspaceSnapshot,
} from '@ddlbuilder/shared-types/workspace';
import { withDefaultEditorSession } from '@ddlbuilder/shared-types';
import { normalizeWorkspaceSnapshot } from '@ddlbuilder/workspace-core';
import {
  addSavedTable,
  deleteSavedTable,
  listSavedTables,
  listTrashedSavedTables,
} from '@/utils/savedTablesDb';
import { clearFolders, bulkPutFolders } from '@/utils/tableFolders';
import {
  DEFAULT_DRAFT_ID,
  clearWorkspaceSession,
  deleteDraft,
  deleteSavedDraft,
  listDrafts,
  listSavedDrafts,
  listTrashedDrafts,
  upsertSavedDraft,
  writeDraft,
} from '@/utils/workspaceStateDb';

export const WORKSPACE_SNAPSHOT_APPLIED_EVENT = 'ddlbuilder:workspace-snapshot-applied';

export const dispatchWorkspaceSnapshotApplied = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WORKSPACE_SNAPSHOT_APPLIED_EVENT));
  }
};

// 迁移快照是“本地无有意义数据”前提下的整体恢复，直接清空当前 scope 后重放云端记录。
const replaceLocalWorkspaceSnapshot = async (
  snapshot: WorkspaceSnapshot,
  scope: WorkspaceScope,
) => {
  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot);
  const [localDrafts, localTrashedDrafts, localSavedTables, localTrashedTables, localSavedDrafts] =
    await Promise.all([
      listDrafts(scope),
      listTrashedDrafts(scope),
      listSavedTables(scope),
      listTrashedSavedTables(scope),
      listSavedDrafts(scope),
    ]);

  await deleteDraft(DEFAULT_DRAFT_ID, scope);
  await clearWorkspaceSession(scope);
  await clearFolders(scope);

  await Promise.all([
    ...[...localDrafts, ...localTrashedDrafts].map((item) => deleteDraft(item.draftId, scope)),
    ...[...localSavedTables, ...localTrashedTables].map((item) =>
      deleteSavedTable(item.normalizedName, scope),
    ),
    ...Object.keys(localSavedDrafts).map((normalizedName) =>
      deleteSavedDraft(normalizedName, scope),
    ),
  ]);

  for (const item of normalizedSnapshot.drafts) {
    await writeDraft(
      item.draftId,
      {
        state: withDefaultEditorSession(item.state),
        createdAt: item.createdAt ?? item.updatedAt,
        updatedAt: item.updatedAt,
        folderId: item.folderId,
        trashedAt: item.trashedAt,
      },
      scope,
    );
  }

  for (const item of normalizedSnapshot.savedTables) {
    await addSavedTable(
      {
        tableId: item.tableId,
        normalizedName: item.normalizedName,
        name: item.name,
        state: withDefaultEditorSession(item.state),
        createdAt: item.createdAt ?? item.updatedAt,
        updatedAt: item.updatedAt,
        folderId: item.folderId,
        trashedAt: item.trashedAt,
      },
      scope,
    );
  }

  for (const item of normalizedSnapshot.savedDrafts) {
    const nextDraft: SavedTableDraftRecord = {
      tableId: item.tableId,
      tableName: item.tableName,
      state: withDefaultEditorSession(item.state),
      updatedAt: item.updatedAt,
      baseSignature: item.baseSignature,
      baseState: item.baseState,
    };
    await upsertSavedDraft(item.normalizedName, nextDraft, scope);
  }

  if (normalizedSnapshot.folders.length > 0) {
    await bulkPutFolders(normalizedSnapshot.folders, scope);
  }
};

export const applyCloudSnapshotToLocal = async (
  snapshot: WorkspaceSnapshot,
  options: {
    scope: WorkspaceScope;
  },
) => {
  await replaceLocalWorkspaceSnapshot(snapshot, options.scope);
  dispatchWorkspaceSnapshotApplied();
};
