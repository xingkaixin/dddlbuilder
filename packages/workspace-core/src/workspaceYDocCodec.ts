import * as Y from 'yjs';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import { tableDocToPersistedState, tableMetadata } from './workspaceTableDoc';
import {
  ensureWorkspaceYDocMeta,
  getDraftRecordFromYDoc,
  getWorkspaceRoot,
  readFolderRecords,
  upsertTableRecord,
  writeFolderRecord,
} from './workspaceYDoc';
import { DEFAULT_DRAFT_ID } from './snapshotMergePolicy';

export const importWorkspaceSnapshotToYDoc = (doc: Y.Doc, snapshot: WorkspaceSnapshot) => {
  doc.transact(() => {
    ensureWorkspaceYDocMeta(doc);
    const { drafts, savedTables, savedDrafts } = getWorkspaceRoot(doc);

    if (snapshot.globalDraft) {
      upsertTableRecord(drafts, DEFAULT_DRAFT_ID, snapshot.globalDraft.state, {
        updatedAt: snapshot.globalDraft.updatedAt,
      });
    }

    for (const draft of snapshot.drafts) {
      upsertTableRecord(drafts, draft.draftId, draft.state, {
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
        folderId: draft.folderId,
      });
    }

    for (const table of snapshot.savedTables) {
      upsertTableRecord(savedTables, table.normalizedName, table.state, {
        normalizedName: table.normalizedName,
        name: table.name,
        createdAt: table.createdAt ?? table.updatedAt,
        updatedAt: table.updatedAt,
        folderId: table.folderId,
      });
    }

    for (const draft of snapshot.savedDrafts) {
      upsertTableRecord(savedDrafts, draft.normalizedName, draft.state, {
        normalizedName: draft.normalizedName,
        tableName: draft.tableName,
        baseSignature: draft.baseSignature,
        updatedAt: draft.updatedAt,
      });
    }

    for (const folder of snapshot.folders) {
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
      const now = Date.now();
      return {
        normalizedName,
        name: typeof metadata.name === 'string' ? metadata.name : normalizedName,
        state: tableDocToPersistedState(tableDoc),
        createdAt: typeof metadata.createdAt === 'number' ? metadata.createdAt : now,
        updatedAt: typeof metadata.updatedAt === 'number' ? metadata.updatedAt : now,
        ...(typeof metadata.folderId === 'string' ? { folderId: metadata.folderId } : {}),
      };
    }),
    savedDrafts: Array.from(savedDrafts.entries()).map(([normalizedName, tableDoc]) => {
      const metadata = tableMetadata(tableDoc);
      return {
        normalizedName,
        tableName: typeof metadata.tableName === 'string' ? metadata.tableName : normalizedName,
        state: tableDocToPersistedState(tableDoc),
        updatedAt: typeof metadata.updatedAt === 'number' ? metadata.updatedAt : Date.now(),
        baseSignature: typeof metadata.baseSignature === 'string' ? metadata.baseSignature : '',
      };
    }),
    folders: readFolderRecords(doc),
  };
};

export const isWorkspaceYDocInitialized = (doc: Y.Doc) =>
  doc.getMap('meta').get('schemaVersion') != null;
