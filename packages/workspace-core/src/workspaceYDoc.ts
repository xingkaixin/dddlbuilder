import type * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { TableFolderSnapshot } from '@ddlbuilder/shared-types/workspace';
import {
  type ApplyPersistedStateOptions,
  applyPersistedStateToTableDoc,
  materializeTableDoc,
  tableDocToPersistedState,
  tableMetadata,
} from './workspaceTableDoc';
import { ensureMap, type JsonRecord, readJsonMap, writeJsonMap } from './yMapJson';

export const WORKSPACE_YDOC_SCHEMA_VERSION = 1;

export type WorkspaceYDocDraftRecord = {
  state: PersistedState;
  createdAt?: number;
  updatedAt: number;
  folderId?: string;
};

export const getWorkspaceRoot = (doc: Y.Doc) => ({
  meta: doc.getMap('meta'),
  drafts: doc.getMap<Y.Map<unknown>>('drafts'),
  savedTables: doc.getMap<Y.Map<unknown>>('savedTables'),
  savedDrafts: doc.getMap<Y.Map<unknown>>('savedDrafts'),
  folders: doc.getMap<Y.Map<unknown>>('folders'),
});

export const ensureWorkspaceYDocMeta = (doc: Y.Doc) => {
  const { meta } = getWorkspaceRoot(doc);
  if (meta.get('schemaVersion') !== WORKSPACE_YDOC_SCHEMA_VERSION) {
    meta.set('schemaVersion', WORKSPACE_YDOC_SCHEMA_VERSION);
  }
};

export const isWorkspaceYDocEmpty = (doc: Y.Doc) => {
  const { drafts, savedTables, savedDrafts, folders } = getWorkspaceRoot(doc);
  return (
    drafts.size === 0 && savedTables.size === 0 && savedDrafts.size === 0 && folders.size === 0
  );
};

export const materializeWorkspaceYDoc = (doc: Y.Doc) => {
  const { drafts, savedTables, savedDrafts } = getWorkspaceRoot(doc);
  let materialized = false;
  for (const collection of [drafts, savedTables, savedDrafts]) {
    for (const tableDoc of collection.values()) {
      materialized = materializeTableDoc(tableDoc) || materialized;
    }
  }
  return materialized;
};

export const upsertTableRecord = (
  collection: Y.Map<Y.Map<unknown>>,
  key: string,
  state: PersistedState,
  metadata: JsonRecord,
  options?: ApplyPersistedStateOptions,
) => {
  const tableDoc = ensureMap(collection, key);
  applyPersistedStateToTableDoc(tableDoc, state, options);
  writeJsonMap(ensureMap(tableDoc, 'metadata'), metadata);
};

export const getDraftRecordFromYDoc = (
  doc: Y.Doc,
  draftId: string,
): WorkspaceYDocDraftRecord | null => {
  const tableDoc = getWorkspaceRoot(doc).drafts.get(draftId);
  if (!tableDoc) return null;
  const metadata = tableMetadata(tableDoc);
  return {
    state: tableDocToPersistedState(tableDoc),
    createdAt: typeof metadata.createdAt === 'number' ? metadata.createdAt : undefined,
    updatedAt: typeof metadata.updatedAt === 'number' ? metadata.updatedAt : Date.now(),
    ...(typeof metadata.folderId === 'string' ? { folderId: metadata.folderId } : {}),
  };
};

export const writeFolderRecord = (doc: Y.Doc, folder: TableFolderSnapshot) => {
  writeJsonMap(ensureMap(getWorkspaceRoot(doc).folders, folder.id), folder as JsonRecord);
};

export const readFolderRecords = (doc: Y.Doc): TableFolderSnapshot[] =>
  Array.from(getWorkspaceRoot(doc).folders.entries())
    .map(([id, map]): TableFolderSnapshot | null => {
      const record = readJsonMap(map);
      if (typeof record.name !== 'string') return null;
      return {
        id,
        name: record.name,
        parentId: typeof record.parentId === 'string' ? record.parentId : undefined,
        order: typeof record.order === 'number' ? record.order : 0,
        createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
      };
    })
    .filter((folder): folder is TableFolderSnapshot => folder != null)
    .sort((a, b) => a.order - b.order);
