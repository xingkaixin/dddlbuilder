import * as Y from 'yjs';
import type { SchemaDocumentState } from '@ddlbuilder/shared-types';
import type {
  TableFolderSnapshot,
  WorkspaceSnapshot,
  WorkspaceSource,
} from '@ddlbuilder/shared-types/workspace';
import {
  type ApplySchemaDocumentStateOptions,
  tableDocToSchemaDocumentState,
  tableMetadata,
} from './workspaceTableDoc';
import {
  getDraftRecordFromYDoc,
  getWorkspaceRoot,
  readFolderRecords,
  upsertTableRecord,
  writeFolderRecord,
} from './workspaceYDoc';
import { readWorkspaceCreatedAt, readWorkspaceTimestamp } from './workspaceMetadata';

export type WorkspaceSavedTableRecord = Omit<
  WorkspaceSnapshot['savedTables'][number],
  'createdAt'
> & { createdAt: number };
export type WorkspaceSavedDraftRecord = WorkspaceSnapshot['savedDrafts'][number];
export type WorkspaceDraftRecord = Omit<WorkspaceSnapshot['drafts'][number], 'draftId'>;
export type WorkspaceYDocCollection = 'drafts' | 'savedTables' | 'savedDrafts' | 'folders';
export type WorkspaceYDocChange = {
  collection: WorkspaceYDocCollection;
  entityIds: ReadonlySet<string>;
  origin: unknown;
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

const listWorkspaceDraftRecords = (doc: Y.Doc) =>
  Array.from(getWorkspaceRoot(doc).drafts.keys()).flatMap((draftId) => {
    const record = getDraftRecordFromYDoc(doc, draftId);
    return record ? [{ draftId, record }] : [];
  });

export const listWorkspaceDrafts = (doc: Y.Doc) =>
  listWorkspaceDraftRecords(doc).filter(({ record }) => record.trashedAt == null);

export const listWorkspaceTrashedDrafts = (doc: Y.Doc) =>
  listWorkspaceDraftRecords(doc).filter(({ record }) => record.trashedAt != null);

export const upsertWorkspaceSavedTable = (
  doc: Y.Doc,
  record: WorkspaceSavedTableRecord,
  options?: ApplySchemaDocumentStateOptions,
) => {
  upsertTableRecord(
    getWorkspaceRoot(doc).savedTables,
    record.normalizedName,
    record.state,
    {
      normalizedName: record.normalizedName,
      name: record.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      folderId: record.folderId,
      trashedAt: record.trashedAt,
    },
    options,
  );
};

export const deleteWorkspaceSavedTable = (doc: Y.Doc, normalizedName: string) => {
  getWorkspaceRoot(doc).savedTables.delete(normalizedName);
};

export const getWorkspaceSavedTable = (
  doc: Y.Doc,
  normalizedName: string,
): WorkspaceSavedTableRecord | null => {
  const tableDoc = getWorkspaceRoot(doc).savedTables.get(normalizedName);
  if (!tableDoc) return null;
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
};

const listWorkspaceSavedTableRecords = (doc: Y.Doc): WorkspaceSavedTableRecord[] =>
  Array.from(getWorkspaceRoot(doc).savedTables.keys()).flatMap((normalizedName) => {
    const record = getWorkspaceSavedTable(doc, normalizedName);
    return record ? [record] : [];
  });

export const listWorkspaceSavedTables = (doc: Y.Doc): WorkspaceSavedTableRecord[] =>
  listWorkspaceSavedTableRecords(doc).filter((record) => record.trashedAt == null);

export const listWorkspaceTrashedSavedTables = (doc: Y.Doc): WorkspaceSavedTableRecord[] =>
  listWorkspaceSavedTableRecords(doc).filter((record) => record.trashedAt != null);

export const upsertWorkspaceSavedDraft = (
  doc: Y.Doc,
  record: WorkspaceSavedDraftRecord,
  options?: ApplySchemaDocumentStateOptions,
) => {
  upsertTableRecord(
    getWorkspaceRoot(doc).savedDrafts,
    record.normalizedName,
    record.state,
    {
      normalizedName: record.normalizedName,
      tableName: record.tableName,
      baseSignature: record.baseSignature,
      updatedAt: record.updatedAt,
    },
    options,
  );
};

export const deleteWorkspaceSavedDraft = (doc: Y.Doc, normalizedName: string) => {
  getWorkspaceRoot(doc).savedDrafts.delete(normalizedName);
};

export const getWorkspaceSavedDraft = (
  doc: Y.Doc,
  normalizedName: string,
): WorkspaceSavedDraftRecord | null => {
  const tableDoc = getWorkspaceRoot(doc).savedDrafts.get(normalizedName);
  if (!tableDoc) return null;
  const metadata = tableMetadata(tableDoc);
  return {
    normalizedName,
    tableName: typeof metadata.tableName === 'string' ? metadata.tableName : normalizedName,
    state: tableDocToSchemaDocumentState(tableDoc),
    baseSignature: typeof metadata.baseSignature === 'string' ? metadata.baseSignature : '',
    updatedAt: readWorkspaceTimestamp(metadata.updatedAt),
  };
};

export const listWorkspaceSavedDrafts = (doc: Y.Doc): WorkspaceSavedDraftRecord[] =>
  Array.from(getWorkspaceRoot(doc).savedDrafts.keys()).flatMap((normalizedName) => {
    const record = getWorkspaceSavedDraft(doc, normalizedName);
    return record ? [record] : [];
  });

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
  const record = getWorkspaceSavedTable(doc, source.normalizedName);
  return record && record.trashedAt == null ? record.state : null;
};

export const subscribeWorkspaceYDoc = (
  doc: Y.Doc,
  notify: (change: WorkspaceYDocChange) => void,
  collections: readonly WorkspaceYDocCollection[] = [
    'drafts',
    'savedTables',
    'savedDrafts',
    'folders',
  ],
) => {
  const roots = getWorkspaceRoot(doc);
  const subscriptions = collections.map((collection) => {
    const root = roots[collection];
    const handleChange = (
      events: Y.YEvent<Y.AbstractType<unknown>>[],
      transaction: Y.Transaction,
    ) => {
      const entityIds = new Set<string>();
      for (const event of events) {
        const entityId = event.path[0];
        if (typeof entityId === 'string') {
          entityIds.add(entityId);
          continue;
        }
        if (event instanceof Y.YMapEvent) {
          for (const key of event.changes.keys.keys()) entityIds.add(key);
        }
      }
      notify({ collection, entityIds, origin: transaction.origin });
    };
    root.observeDeep(handleChange);
    return { root, handleChange };
  });
  return () => {
    for (const { root, handleChange } of subscriptions) root.unobserveDeep(handleChange);
  };
};
