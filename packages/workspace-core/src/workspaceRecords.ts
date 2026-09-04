import * as Y from 'yjs';
import type { SchemaDocumentState } from '@ddlbuilder/shared-types';
import type {
  TableFolderSnapshot,
  WorkspaceSnapshot,
  WorkspaceSource,
} from '@ddlbuilder/shared-types/workspace';
import type { ApplySchemaDocumentStateOptions } from './workspaceTableDoc';
import {
  getDraftRecordFromYDoc,
  getWorkspaceRoot,
  readFolderRecords,
  upsertTableRecord,
  WORKSPACE_YDOC_COLLECTIONS,
  type WorkspaceYDocCollection,
  writeFolderRecord,
} from './workspaceYDoc';
import { getWorkspaceSavedTable, readWorkspaceSavedRecordIdentity } from './workspaceSavedRecords';
export {
  upsertWorkspaceSavedTable,
  recreateWorkspaceSavedTable,
  deleteWorkspaceSavedTable,
  getWorkspaceSavedTable,
  updateWorkspaceSavedTableMetadata,
  listWorkspaceSavedTables,
  listWorkspaceTrashedSavedTables,
  upsertWorkspaceSavedDraft,
  deleteWorkspaceSavedDraft,
  getWorkspaceSavedDraft,
  listWorkspaceSavedDrafts,
  renameWorkspaceSavedDraft,
  renameWorkspaceSavedTable,
  type WorkspaceSavedTableRecord,
  type WorkspaceSavedTableMetadataUpdate,
  type WorkspaceSavedDraftRecord,
} from './workspaceSavedRecords';

export type WorkspaceDraftRecord = Omit<WorkspaceSnapshot['drafts'][number], 'draftId'>;
export type { WorkspaceYDocCollection } from './workspaceYDoc';
export type WorkspaceYDocChange = {
  collection: WorkspaceYDocCollection;
  entityIds: ReadonlySet<string>;
  origin: unknown;
  renamedTables?: Array<{
    previousName: string;
    normalizedName: string;
    tableName: string;
    tableId?: string;
  }>;
};

export const upsertWorkspaceDraft = (
  doc: Y.Doc,
  draftId: string,
  record: WorkspaceDraftRecord,
  options?: ApplySchemaDocumentStateOptions,
) => {
  upsertTableRecord(
    getWorkspaceRoot(doc).drafts,
    draftId,
    record.state,
    {
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      folderId: record.folderId,
      trashedAt: record.trashedAt,
    },
    options,
  );
};

export const deleteWorkspaceDraft = (doc: Y.Doc, draftId: string) => {
  getWorkspaceRoot(doc).drafts.delete(draftId);
};

export const listWorkspaceDraftRecords = (doc: Y.Doc) =>
  Array.from(getWorkspaceRoot(doc).drafts.keys()).flatMap((draftId) => {
    const record = getDraftRecordFromYDoc(doc, draftId);
    return record ? [{ draftId, record }] : [];
  });

export const listWorkspaceDrafts = (doc: Y.Doc) =>
  listWorkspaceDraftRecords(doc).filter(({ record }) => record.trashedAt == null);

export const listWorkspaceTrashedDrafts = (doc: Y.Doc) =>
  listWorkspaceDraftRecords(doc).filter(({ record }) => record.trashedAt != null);

export const upsertWorkspaceFolder = (doc: Y.Doc, folder: TableFolderSnapshot) => {
  writeFolderRecord(doc, folder);
};

export const deleteWorkspaceFolder = (doc: Y.Doc, folderId: string) => {
  getWorkspaceRoot(doc).folders.delete(folderId);
};

export const listWorkspaceFolders = (doc: Y.Doc) => readFolderRecords(doc);

export const getWorkspaceSourceState = (
  doc: Y.Doc,
  source: WorkspaceSource,
): SchemaDocumentState | null => {
  if (source.kind === 'draft') {
    const record = getDraftRecordFromYDoc(doc, source.draftId);
    return record && record.trashedAt == null ? record.state : null;
  }
  const record = getWorkspaceSavedTable(doc, source);
  return record && record.trashedAt == null ? record.state : null;
};

export const subscribeWorkspaceYDoc = (
  doc: Y.Doc,
  notify: (change: WorkspaceYDocChange) => void,
  collections: readonly WorkspaceYDocCollection[] = WORKSPACE_YDOC_COLLECTIONS,
) => {
  const roots = getWorkspaceRoot(doc);
  const subscriptions = collections.map((collection) => {
    const root = roots[collection];
    const readIdentity = (key: string) => {
      const value = root.get(key);
      if (!value) return null;
      if (collection !== 'savedTables' && collection !== 'savedDrafts') {
        return { normalizedName: key, tableName: key, tableId: undefined };
      }
      return readWorkspaceSavedRecordIdentity(doc, collection, key, value);
    };
    const identities = new Map(Array.from(root.keys(), (key) => [key, readIdentity(key)]));
    const handleChange = (
      events: Y.YEvent<Y.AbstractType<unknown>>[],
      transaction: Y.Transaction,
    ) => {
      const changedKeys = new Set<string>();
      for (const event of events) {
        const key = event.path[0];
        if (typeof key === 'string') changedKeys.add(key);
        else if (event instanceof Y.YMapEvent) {
          for (const changedKey of event.changes.keys.keys()) changedKeys.add(changedKey);
        }
      }
      const entityIds = new Set<string>();
      const renamedTables: NonNullable<WorkspaceYDocChange['renamedTables']> = [];
      for (const key of changedKeys) {
        const previous = identities.get(key);
        const next = readIdentity(key);
        if (previous) {
          entityIds.add(previous.normalizedName);
          if (previous.tableId) entityIds.add(previous.tableId);
        }
        if (next) {
          entityIds.add(next.normalizedName);
          if (next.tableId) entityIds.add(next.tableId);
          identities.set(key, next);
        } else identities.delete(key);
        if (
          collection === 'savedTables' &&
          previous &&
          next &&
          (previous.normalizedName !== next.normalizedName || previous.tableName !== next.tableName)
        ) {
          renamedTables.push({ previousName: previous.normalizedName, ...next });
        }
      }
      notify({
        collection,
        entityIds,
        origin: transaction.origin,
        ...(renamedTables.length > 0 ? { renamedTables } : {}),
      });
    };
    root.observeDeep(handleChange);
    return { root, handleChange };
  });
  return () => {
    for (const { root, handleChange } of subscriptions) root.unobserveDeep(handleChange);
  };
};
