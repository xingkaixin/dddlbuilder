import * as Y from 'yjs';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import { tableDocToSchemaDocumentState, tableMetadata } from './workspaceTableDoc';
import {
  ensureWorkspaceYDocMeta,
  getDraftRecordFromYDoc,
  getWorkspaceRoot,
  readFolderRecords,
  upsertTableRecord,
  writeFolderRecord,
} from './workspaceYDoc';
import { shouldAcceptSnapshotRecord } from './snapshotMergePolicy';
import { readWorkspaceCreatedAt, readWorkspaceTimestamp } from './workspaceMetadata';
import { normalizeWorkspaceSnapshot } from './workspaceSnapshotNormalization';

export const importWorkspaceSnapshotToYDoc = (doc: Y.Doc, snapshot: WorkspaceSnapshot) => {
  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot);
  doc.transact(() => {
    ensureWorkspaceYDocMeta(doc);
    const { drafts, savedTables, savedDrafts } = getWorkspaceRoot(doc);

    for (const draft of normalizedSnapshot.drafts) {
      upsertTableRecord(drafts, draft.draftId, draft.state, {
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
        folderId: draft.folderId,
        trashedAt: draft.trashedAt,
      });
    }

    for (const table of normalizedSnapshot.savedTables) {
      upsertTableRecord(savedTables, table.normalizedName, table.state, {
        normalizedName: table.normalizedName,
        name: table.name,
        createdAt: table.createdAt ?? table.updatedAt,
        updatedAt: table.updatedAt,
        folderId: table.folderId,
        trashedAt: table.trashedAt,
      });
    }

    for (const draft of normalizedSnapshot.savedDrafts) {
      upsertTableRecord(savedDrafts, draft.normalizedName, draft.state, {
        normalizedName: draft.normalizedName,
        tableName: draft.tableName,
        baseSignature: draft.baseSignature,
        updatedAt: draft.updatedAt,
      });
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
  const { drafts, savedTables, savedDrafts } = getWorkspaceRoot(doc);

  return {
    globalDraft: null,
    drafts: Array.from(drafts.keys()).flatMap((draftId) => {
      const record = getDraftRecordFromYDoc(doc, draftId);
      return record ? [{ draftId, ...record }] : [];
    }),
    savedTables: Array.from(savedTables.entries()).map(([normalizedName, tableDoc]) => {
      const metadata = tableMetadata(tableDoc);
      const updatedAt = readWorkspaceTimestamp(metadata.updatedAt);
      return {
        normalizedName,
        name: typeof metadata.name === 'string' ? metadata.name : normalizedName,
        state: tableDocToSchemaDocumentState(tableDoc),
        createdAt: readWorkspaceCreatedAt(metadata.createdAt, updatedAt),
        updatedAt,
        ...(typeof metadata.folderId === 'string' ? { folderId: metadata.folderId } : {}),
        ...(typeof metadata.trashedAt === 'number' ? { trashedAt: metadata.trashedAt } : {}),
      };
    }),
    savedDrafts: Array.from(savedDrafts.entries()).map(([normalizedName, tableDoc]) => {
      const metadata = tableMetadata(tableDoc);
      return {
        normalizedName,
        tableName: typeof metadata.tableName === 'string' ? metadata.tableName : normalizedName,
        state: tableDocToSchemaDocumentState(tableDoc),
        updatedAt: readWorkspaceTimestamp(metadata.updatedAt),
        baseSignature: typeof metadata.baseSignature === 'string' ? metadata.baseSignature : '',
      };
    }),
    folders: readFolderRecords(doc),
  };
};

export const mergeWorkspaceSnapshotIntoYDoc = (doc: Y.Doc, snapshot: WorkspaceSnapshot) => {
  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot);
  const current = exportWorkspaceYDocToSnapshot(doc);
  const currentDrafts = new Map(current.drafts.map((draft) => [draft.draftId, draft]));
  const currentTables = new Map(current.savedTables.map((table) => [table.normalizedName, table]));
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
        currentTables.get(table.normalizedName)?.updatedAt,
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
