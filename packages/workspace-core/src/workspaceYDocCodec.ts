import * as Y from 'yjs';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import {
  ensureWorkspaceYDocMeta,
  getDraftRecordFromYDoc,
  getWorkspaceRoot,
  readFolderRecords,
  upsertTableRecord,
  writeFolderRecord,
} from './workspaceYDoc';
import { shouldAcceptSnapshotRecord } from './snapshotMergePolicy';
import {
  listWorkspaceSavedTableRecords,
  listWorkspaceSavedDrafts,
  upsertWorkspaceSavedTable,
  upsertWorkspaceSavedDraft,
} from './workspaceSavedRecords';
import { normalizeWorkspaceSnapshot } from './workspaceSnapshotNormalization';

export const importWorkspaceSnapshotToYDoc = (doc: Y.Doc, snapshot: WorkspaceSnapshot) => {
  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot);
  doc.transact(() => {
    ensureWorkspaceYDocMeta(doc);
    const { drafts } = getWorkspaceRoot(doc);

    for (const draft of normalizedSnapshot.drafts) {
      upsertTableRecord(drafts, draft.draftId, draft.state, {
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
        folderId: draft.folderId,
        trashedAt: draft.trashedAt,
      });
    }

    for (const table of normalizedSnapshot.savedTables) {
      upsertWorkspaceSavedTable(doc, {
        ...table,
        tableId: table.tableId ?? `legacy:${table.normalizedName}`,
        createdAt: table.createdAt ?? table.updatedAt,
      });
    }

    for (const draft of normalizedSnapshot.savedDrafts) {
      upsertWorkspaceSavedDraft(doc, draft);
    }

    for (const folder of normalizedSnapshot.folders) {
      writeFolderRecord(doc, folder);
    }
  });
};

export const createWorkspaceYDocUpdateFromSnapshot = (snapshot: WorkspaceSnapshot) => {
  const doc = new Y.Doc();
  importWorkspaceSnapshotToYDoc(doc, snapshot);
  return Y.encodeStateAsUpdate(doc);
};

export const exportWorkspaceYDocToSnapshot = (doc: Y.Doc): WorkspaceSnapshot => {
  const { drafts } = getWorkspaceRoot(doc);

  return {
    globalDraft: null,
    drafts: Array.from(drafts.keys()).flatMap((draftId) => {
      const record = getDraftRecordFromYDoc(doc, draftId);
      return record ? [{ draftId, ...record }] : [];
    }),
    savedTables: listWorkspaceSavedTableRecords(doc),
    savedDrafts: listWorkspaceSavedDrafts(doc),
    folders: readFolderRecords(doc),
  };
};

export const mergeWorkspaceSnapshotIntoYDoc = (doc: Y.Doc, snapshot: WorkspaceSnapshot) => {
  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot);
  const current = exportWorkspaceYDocToSnapshot(doc);
  const currentDrafts = new Map(current.drafts.map((draft) => [draft.draftId, draft]));
  const currentTables = new Map(
    current.savedTables.map((table) => [table.tableId ?? `legacy:${table.normalizedName}`, table]),
  );
  const currentSavedDrafts = new Map(
    current.savedDrafts.map((draft) => [draft.normalizedName, draft]),
  );
  const currentFolders = new Map(current.folders.map((folder) => [folder.id, folder]));
  const merged: WorkspaceSnapshot = {
    globalDraft: null,
    drafts: [],
    savedTables: [],
    savedDrafts: [],
    folders: [],
  };

  for (const draft of normalizedSnapshot.drafts) {
    if (shouldAcceptSnapshotRecord(draft.updatedAt, currentDrafts.get(draft.draftId)?.updatedAt)) {
      merged.drafts.push(draft);
    }
  }
  for (const table of normalizedSnapshot.savedTables) {
    if (
      shouldAcceptSnapshotRecord(
        table.updatedAt,
        currentTables.get(table.tableId ?? `legacy:${table.normalizedName}`)?.updatedAt,
      )
    ) {
      merged.savedTables.push(table);
    }
  }
  for (const draft of normalizedSnapshot.savedDrafts) {
    if (
      shouldAcceptSnapshotRecord(
        draft.updatedAt,
        currentSavedDrafts.get(draft.normalizedName)?.updatedAt,
      )
    ) {
      merged.savedDrafts.push(draft);
    }
  }
  for (const folder of normalizedSnapshot.folders) {
    if (shouldAcceptSnapshotRecord(folder.updatedAt, currentFolders.get(folder.id)?.updatedAt)) {
      merged.folders.push(folder);
    }
  }

  if (
    merged.drafts.length > 0 ||
    merged.savedTables.length > 0 ||
    merged.savedDrafts.length > 0 ||
    merged.folders.length > 0
  ) {
    importWorkspaceSnapshotToYDoc(doc, merged);
  }
};

export const isWorkspaceYDocInitialized = (doc: Y.Doc) =>
  doc.getMap('meta').get('schemaVersion') != null;
