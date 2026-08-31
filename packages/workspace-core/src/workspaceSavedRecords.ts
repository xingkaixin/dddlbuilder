import * as Y from 'yjs';
import { decodeSavedDraftBase } from './persistedStateCodec';
import {
  savedTableReference,
  type SavedTableTarget,
  type WorkspaceSnapshot,
} from '@ddlbuilder/shared-types/workspace';
import {
  type ApplySchemaDocumentStateOptions,
  tableDocToSchemaDocumentState,
  tableMetadata,
} from './workspaceTableDoc';
import { getWorkspaceRoot, upsertTableRecord } from './workspaceYDoc';
import { readWorkspaceCreatedAt, readWorkspaceTimestamp } from './workspaceMetadata';
import { ensureMap, writeJsonMap, writeJsonMapPatch } from './yMapJson';

export type WorkspaceSavedTableRecord = Omit<
  WorkspaceSnapshot['savedTables'][number],
  'createdAt' | 'tableId'
> & { tableId: string; createdAt: number };
export type WorkspaceSavedDraftRecord = WorkspaceSnapshot['savedDrafts'][number];
export type WorkspaceSavedTableMetadataUpdate = Pick<
  WorkspaceSavedTableRecord,
  'folderId' | 'trashedAt' | 'updatedAt'
>;

const savedTableName = (key: string, tableDoc: Y.Map<unknown>) => {
  const name = tableMetadata(tableDoc).normalizedName;
  return typeof name === 'string' ? name : key;
};

const savedTableId = (key: string, tableDoc: Y.Map<unknown>) => {
  const id = tableMetadata(tableDoc).tableId;
  return typeof id === 'string' ? id : `legacy:${key}`;
};

const availableRecordKey = (collection: Y.Map<Y.Map<unknown>>, preferred: string) => {
  let key = preferred;
  for (let suffix = 1; collection.has(key); suffix += 1) key = `${preferred}:${suffix}`;
  return key;
};

const findSavedTableEntry = (doc: Y.Doc, target: SavedTableTarget) => {
  const { normalizedName, tableId } = savedTableReference(target);
  const tables = getWorkspaceRoot(doc).savedTables;
  const matches = (key: string, value: Y.Map<unknown>) =>
    tableId ? savedTableId(key, value) === tableId : savedTableName(key, value) === normalizedName;
  if (tableId) {
    const direct = tables.get(tableId);
    if (direct && matches(tableId, direct)) return [tableId, direct] as const;
  }
  const entries = Array.from(tables.entries()).filter(([key, value]) => matches(key, value));
  if (entries.length > 1)
    throw new Error('Multiple saved tables share this name; select a table by ID');
  return entries[0];
};

const readSavedTableRecord = (key: string, tableDoc: Y.Map<unknown>): WorkspaceSavedTableRecord => {
  const metadata = tableMetadata(tableDoc);
  const normalizedName = savedTableName(key, tableDoc);
  const updatedAt = readWorkspaceTimestamp(metadata.updatedAt);
  return {
    tableId: savedTableId(key, tableDoc),
    normalizedName,
    name: typeof metadata.name === 'string' ? metadata.name : normalizedName,
    state: tableDocToSchemaDocumentState(tableDoc),
    createdAt: readWorkspaceCreatedAt(metadata.createdAt, updatedAt),
    updatedAt,
    ...(typeof metadata.folderId === 'string' ? { folderId: metadata.folderId } : {}),
    ...(typeof metadata.trashedAt === 'number' ? { trashedAt: metadata.trashedAt } : {}),
  };
};

const savedTableMetadata = (record: WorkspaceSavedTableRecord) => ({
  tableId: record.tableId,
  normalizedName: record.normalizedName,
  name: record.name,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  folderId: record.folderId,
  trashedAt: record.trashedAt,
});

const writeWorkspaceSavedTable = (
  doc: Y.Doc,
  record: WorkspaceSavedTableRecord,
  recreate: boolean,
  options?: ApplySchemaDocumentStateOptions,
) => {
  const { savedTables } = getWorkspaceRoot(doc);
  const key =
    findSavedTableEntry(doc, record)?.[0] ?? availableRecordKey(savedTables, record.tableId);
  if (recreate) savedTables.set(key, new Y.Map<unknown>());
  upsertTableRecord(savedTables, key, record.state, savedTableMetadata(record), options);
};

export const upsertWorkspaceSavedTable = (
  doc: Y.Doc,
  record: WorkspaceSavedTableRecord,
  options?: ApplySchemaDocumentStateOptions,
) => {
  // Legacy nodes keep their original key: moving a Y.Map would discard concurrent child edits.
  writeWorkspaceSavedTable(doc, record, false, options);
};

export const recreateWorkspaceSavedTable = (
  doc: Y.Doc,
  record: WorkspaceSavedTableRecord,
  options?: ApplySchemaDocumentStateOptions,
) => writeWorkspaceSavedTable(doc, record, true, options);

export const deleteWorkspaceSavedTable = (doc: Y.Doc, target: SavedTableTarget) => {
  const entry = findSavedTableEntry(doc, target);
  if (entry) getWorkspaceRoot(doc).savedTables.delete(entry[0]);
};

export const getWorkspaceSavedTable = (
  doc: Y.Doc,
  target: SavedTableTarget,
): WorkspaceSavedTableRecord | null => {
  const entry = findSavedTableEntry(doc, target);
  return entry ? readSavedTableRecord(...entry) : null;
};

export const updateWorkspaceSavedTableMetadata = (
  doc: Y.Doc,
  target: SavedTableTarget,
  update: WorkspaceSavedTableMetadataUpdate,
): WorkspaceSavedTableRecord | null => {
  const entry = findSavedTableEntry(doc, target);
  if (!entry) return null;
  writeJsonMapPatch(ensureMap(entry[1], 'metadata'), update);
  return readSavedTableRecord(...entry);
};

export const listWorkspaceSavedTableRecords = (doc: Y.Doc): WorkspaceSavedTableRecord[] =>
  Array.from(getWorkspaceRoot(doc).savedTables.entries()).map(([key, tableDoc]) =>
    readSavedTableRecord(key, tableDoc),
  );

export const listWorkspaceSavedTables = (doc: Y.Doc): WorkspaceSavedTableRecord[] =>
  listWorkspaceSavedTableRecords(doc).filter((record) => record.trashedAt == null);

export const listWorkspaceTrashedSavedTables = (doc: Y.Doc): WorkspaceSavedTableRecord[] =>
  listWorkspaceSavedTableRecords(doc).filter((record) => record.trashedAt != null);

const findSavedDraftEntry = (doc: Y.Doc, target: SavedTableTarget) => {
  const reference = savedTableReference(target);
  const { normalizedName } = reference;
  const { savedDrafts } = getWorkspaceRoot(doc);
  const parent = findSavedTableEntry(doc, target);
  const tableId = reference.tableId ?? (parent ? savedTableId(...parent) : undefined);
  const directKey = parent?.[0] ?? normalizedName;
  const matches = (key: string, value: Y.Map<unknown>) => {
    const metadata = tableMetadata(value);
    if (typeof metadata.tableId === 'string') {
      if (tableId) return metadata.tableId === tableId;
      return (
        savedTableName(key, value) === normalizedName &&
        !findSavedTableEntry(doc, { normalizedName: '', tableId: metadata.tableId })
      );
    }
    const legacyParent = getWorkspaceRoot(doc).savedTables.get(key);
    if (legacyParent && tableId) return savedTableId(key, legacyParent) === tableId;
    return savedTableName(key, legacyParent ?? value) === normalizedName;
  };
  const direct = savedDrafts.get(directKey);
  if (direct && matches(directKey, direct)) return [directKey, direct] as const;
  return Array.from(savedDrafts.entries()).find(([key, value]) => matches(key, value));
};

const readSavedDraftRecord = (
  key: string,
  tableDoc: Y.Map<unknown>,
  parent?: Y.Map<unknown>,
): WorkspaceSavedDraftRecord => {
  const metadata = tableMetadata(tableDoc);
  const normalizedName = parent ? savedTableName(key, parent) : savedTableName(key, tableDoc);
  const tableName = parent ? tableMetadata(parent).name : metadata.tableName;
  return {
    ...(typeof metadata.tableId === 'string'
      ? { tableId: metadata.tableId }
      : parent
        ? { tableId: savedTableId(key, parent) }
        : {}),
    normalizedName,
    tableName: typeof tableName === 'string' ? tableName : normalizedName,
    state: tableDocToSchemaDocumentState(tableDoc),
    ...decodeSavedDraftBase(metadata),
    updatedAt: readWorkspaceTimestamp(metadata.updatedAt),
  };
};

export const upsertWorkspaceSavedDraft = (
  doc: Y.Doc,
  record: WorkspaceSavedDraftRecord,
  options?: ApplySchemaDocumentStateOptions,
) => {
  const parent = findSavedTableEntry(doc, record);
  const tableId = record.tableId ?? (parent ? savedTableId(...parent) : undefined);
  const { savedDrafts } = getWorkspaceRoot(doc);
  const key =
    findSavedDraftEntry(doc, record)?.[0] ??
    availableRecordKey(savedDrafts, tableId ?? record.normalizedName);
  upsertTableRecord(
    savedDrafts,
    key,
    record.state,
    {
      tableId,
      normalizedName: record.normalizedName,
      tableName: record.tableName,
      ...decodeSavedDraftBase(
        record,
        parent ? tableDocToSchemaDocumentState(parent[1]) : undefined,
      ),
      updatedAt: record.updatedAt,
    },
    options,
  );
};

export const deleteWorkspaceSavedDraft = (doc: Y.Doc, target: SavedTableTarget) => {
  const entry = findSavedDraftEntry(doc, target);
  if (entry) getWorkspaceRoot(doc).savedDrafts.delete(entry[0]);
};

export const getWorkspaceSavedDraft = (
  doc: Y.Doc,
  target: SavedTableTarget,
): WorkspaceSavedDraftRecord | null => {
  const entry = findSavedDraftEntry(doc, target);
  const parent = findSavedTableEntry(doc, target);
  return entry ? readSavedDraftRecord(...entry, parent?.[1]) : null;
};

export const listWorkspaceSavedDrafts = (doc: Y.Doc): WorkspaceSavedDraftRecord[] => {
  const { savedTables, savedDrafts } = getWorkspaceRoot(doc);
  const parentsById = new Map(
    Array.from(savedTables.entries(), ([key, value]) => [savedTableId(key, value), value]),
  );
  return Array.from(savedDrafts.entries(), ([key, value]) => {
    const tableId = tableMetadata(value).tableId;
    const parent = typeof tableId === 'string' ? parentsById.get(tableId) : savedTables.get(key);
    return readSavedDraftRecord(key, value, parent);
  });
};

export const renameWorkspaceSavedDraft = (
  doc: Y.Doc,
  previousName: SavedTableTarget,
  normalizedName: string,
  tableName: string,
) => {
  const entry =
    findSavedDraftEntry(doc, previousName) ??
    findSavedDraftEntry(doc, { ...savedTableReference(previousName), normalizedName });
  if (!entry) return;
  const parent = findSavedTableEntry(doc, { ...savedTableReference(previousName), normalizedName });
  writeJsonMapPatch(ensureMap(entry[1], 'metadata'), {
    ...(parent ? { tableId: savedTableId(...parent) } : {}),
    normalizedName,
    tableName,
  });
};

export const renameWorkspaceSavedTable = (
  doc: Y.Doc,
  previousName: string,
  record: WorkspaceSavedTableRecord,
) => {
  doc.transact(() => {
    const entry = findSavedTableEntry(doc, record);
    if (!entry) throw new Error('Saved table not found');
    writeJsonMap(ensureMap(entry[1], 'metadata'), savedTableMetadata(record));
    renameWorkspaceSavedDraft(
      doc,
      { tableId: record.tableId, normalizedName: previousName },
      record.normalizedName,
      record.name,
    );
  });
};

export const readWorkspaceSavedRecordIdentity = (
  doc: Y.Doc,
  collection: 'savedTables' | 'savedDrafts',
  key: string,
  value: Y.Map<unknown>,
) => {
  const metadata = tableMetadata(value);
  const parent =
    collection === 'savedDrafts'
      ? typeof metadata.tableId === 'string'
        ? findSavedTableEntry(doc, { normalizedName: '', tableId: metadata.tableId })?.[1]
        : getWorkspaceRoot(doc).savedTables.get(key)
      : undefined;
  const namedDoc = parent ?? value;
  const normalizedName = savedTableName(key, namedDoc);
  const name = tableMetadata(namedDoc).name;
  return {
    tableId: savedTableId(key, namedDoc),
    normalizedName,
    tableName: typeof name === 'string' ? name : normalizedName,
  };
};
