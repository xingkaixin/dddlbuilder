import * as Y from 'yjs';
import type { SchemaDocumentState } from '@ddlbuilder/shared-types';
import type { TableFolderSnapshot } from '@ddlbuilder/shared-types/workspace';
import {
  type ApplySchemaDocumentStateOptions,
  applySchemaDocumentStateToTableDoc,
  materializeTableDoc,
  tableDocToSchemaDocumentState,
  tableMetadata,
} from './workspaceTableDoc';
import { ensureMap, type JsonRecord, readJsonMap, writeJsonMap } from './yMapJson';
import { readWorkspaceTimestamp } from './workspaceMetadata';

export const WORKSPACE_YDOC_SCHEMA_VERSION = 1;
export const WORKSPACE_YDOC_COLLECTIONS = [
  'drafts',
  'savedTables',
  'savedDrafts',
  'folders',
] as const;

export type WorkspaceYDocCollection = (typeof WORKSPACE_YDOC_COLLECTIONS)[number];

export type WorkspaceYDocDraftRecord = {
  state: SchemaDocumentState;
  createdAt?: number;
  updatedAt: number;
  folderId?: string;
  trashedAt?: number;
};

type WorkspaceYDocRoot = {
  meta: Y.Map<unknown>;
} & Record<WorkspaceYDocCollection, Y.Map<Y.Map<unknown>>>;

export const getWorkspaceRoot = (doc: Y.Doc): WorkspaceYDocRoot => ({
  meta: doc.getMap('meta'),
  drafts: doc.getMap<Y.Map<unknown>>('drafts'),
  savedTables: doc.getMap<Y.Map<unknown>>('savedTables'),
  savedDrafts: doc.getMap<Y.Map<unknown>>('savedDrafts'),
  folders: doc.getMap<Y.Map<unknown>>('folders'),
});

const assertWorkspaceYDocSchemaVersion = (doc: Y.Doc) => {
  const schemaVersion = getWorkspaceRoot(doc).meta.get('schemaVersion');
  if (schemaVersion !== WORKSPACE_YDOC_SCHEMA_VERSION) {
    throw new Error(`Unsupported workspace schema version: ${String(schemaVersion)}`);
  }
};

export const ensureWorkspaceYDocMeta = (doc: Y.Doc) => {
  const { meta } = getWorkspaceRoot(doc);
  const schemaVersion = meta.get('schemaVersion');
  if (!meta.has('schemaVersion')) {
    if (!isWorkspaceYDocEmpty(doc)) {
      throw new Error(`Unsupported workspace schema version: ${String(schemaVersion)}`);
    }
    meta.set('schemaVersion', WORKSPACE_YDOC_SCHEMA_VERSION);
    return;
  }
  assertWorkspaceYDocSchemaVersion(doc);
};

const TABLE_DOC_MAP_KEYS = ['scalar', 'fields', 'indexes', 'foreignKeys', 'metadata'] as const;
const TABLE_DOC_ARRAY_KEYS = ['fieldOrder', 'indexOrder', 'foreignKeyOrder'] as const;
const ORDERED_TABLE_DOC_MAP_KEYS = ['fields', 'indexes', 'foreignKeys'] as const;

const assertTableDocStructure = (tableDoc: Y.Map<unknown>, collection: string) => {
  for (const key of TABLE_DOC_MAP_KEYS) {
    const value = tableDoc.get(key);
    if (value !== undefined && !(value instanceof Y.Map)) {
      throw new Error(`${collection}.${key} must be a Y.Map`);
    }
  }
  for (const key of TABLE_DOC_ARRAY_KEYS) {
    const value = tableDoc.get(key);
    if (value !== undefined && !(value instanceof Y.Array)) {
      throw new Error(`${collection}.${key} must be a Y.Array`);
    }
  }
  for (const key of ORDERED_TABLE_DOC_MAP_KEYS) {
    const map = tableDoc.get(key);
    if (!(map instanceof Y.Map)) continue;
    for (const value of map.values()) {
      if (!(value instanceof Y.Map)) {
        throw new Error(`${collection}.${key} entries must be Y.Maps`);
      }
    }
  }
};

const assertWorkspaceYDocCollections = (doc: Y.Doc) => {
  const root = getWorkspaceRoot(doc);
  for (const collection of WORKSPACE_YDOC_COLLECTIONS) {
    for (const value of root[collection].values()) {
      if (!(value instanceof Y.Map)) {
        throw new Error(`${collection} entries must be Y.Maps`);
      }
      if (collection !== 'folders') assertTableDocStructure(value, collection);
    }
  }
};

export const assertWorkspaceYDocStructure = (doc: Y.Doc) => {
  assertWorkspaceYDocSchemaVersion(doc);
  assertWorkspaceYDocCollections(doc);
};

export const initializeOrMigrateWorkspaceYDoc = (doc: Y.Doc) => {
  const { meta } = getWorkspaceRoot(doc);
  if (meta.has('schemaVersion')) {
    assertWorkspaceYDocStructure(doc);
    return;
  }
  if (!isWorkspaceYDocEmpty(doc)) assertWorkspaceYDocCollections(doc);
  meta.set('schemaVersion', WORKSPACE_YDOC_SCHEMA_VERSION);
};

export const isWorkspaceYDocEmpty = (doc: Y.Doc) => {
  const root = getWorkspaceRoot(doc);
  return WORKSPACE_YDOC_COLLECTIONS.every((collection) => root[collection].size === 0);
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
  state: SchemaDocumentState,
  metadata: JsonRecord,
  options?: ApplySchemaDocumentStateOptions,
) => {
  const tableDoc = ensureMap(collection, key);
  applySchemaDocumentStateToTableDoc(tableDoc, state, options);
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
    state: tableDocToSchemaDocumentState(tableDoc),
    createdAt: typeof metadata.createdAt === 'number' ? metadata.createdAt : undefined,
    updatedAt: readWorkspaceTimestamp(metadata.updatedAt),
    ...(typeof metadata.folderId === 'string' ? { folderId: metadata.folderId } : {}),
    ...(typeof metadata.trashedAt === 'number' ? { trashedAt: metadata.trashedAt } : {}),
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
        createdAt: readWorkspaceTimestamp(record.createdAt),
        updatedAt: readWorkspaceTimestamp(record.updatedAt ?? record.createdAt),
      };
    })
    .filter((folder): folder is TableFolderSnapshot => folder != null)
    .sort((a, b) => a.order - b.order);
