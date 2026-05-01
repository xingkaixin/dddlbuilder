import * as Y from 'yjs';
import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';

const WORKSPACE_YDOC_SCHEMA_VERSION = 1;
const DEFAULT_DRAFT_ID = 'default';

const TABLE_SCALAR_KEYS = [
  'objectType',
  'schemaName',
  'tableName',
  'tableComment',
  'dbType',
  'sqlFormatMode',
  'viewDefinition',
  'viewCreateOrReplace',
  'addCount',
  'indexInput',
  'currentIndexFields',
  'authInput',
  'authObjects',
  'citusShardingConfig',
  'mysqlPartitionConfig',
  'tableMiscConfig',
  'fieldTableViewConfig',
] as const;

const FIELD_KEYS = [
  'order',
  'fieldName',
  'fieldType',
  'fieldComment',
  'nullable',
  'defaultKind',
  'defaultValue',
  'onUpdate',
  'enumMeta',
] as const;

type JsonRecord = Record<string, unknown>;

const ensureMap = (parent: Y.Map<any>, key: string) => {
  const existing = parent.get(key);
  if (existing instanceof Y.Map) return existing;
  const next = new Y.Map<unknown>();
  parent.set(key, next);
  return next;
};

const ensureArray = (parent: Y.Map<any>, key: string) => {
  const existing = parent.get(key);
  if (existing instanceof Y.Array) return existing as Y.Array<string>;
  const next = new Y.Array<string>();
  parent.set(key, next);
  return next;
};

const writeJsonMap = (map: Y.Map<unknown>, values: JsonRecord) => {
  const keys = new Set(Object.keys(values));
  for (const key of Array.from(map.keys())) {
    if (!keys.has(key)) map.delete(key);
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      map.delete(key);
    } else {
      map.set(key, value);
    }
  }
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
};

const hashString = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
};

const fieldIdForRow = (row: FieldRow, index: number) => {
  const { order: _order, ...rest } = row;
  return `field_${index + 1}_${hashString(stableStringify(rest))}`;
};

const syncStringArray = (array: Y.Array<string>, values: string[]) => {
  array.delete(0, array.length);
  if (values.length > 0) array.insert(0, values);
};

const writeOrderedMap = <T extends { id: string }>(
  parent: Y.Map<any>,
  mapKey: string,
  orderKey: string,
  values: T[],
) => {
  const map = ensureMap(parent, mapKey);
  const order = ensureArray(parent, orderKey);
  const ids = values.map((value) => value.id);
  for (const value of values) {
    writeJsonMap(ensureMap(map, value.id), value as JsonRecord);
  }
  syncStringArray(order, ids);
};

const applyPersistedStateToTableDoc = (tableDoc: Y.Map<unknown>, state: PersistedState) => {
  const scalarValues: JsonRecord = {};
  for (const key of TABLE_SCALAR_KEYS) {
    scalarValues[key] = state[key];
  }
  writeJsonMap(ensureMap(tableDoc, 'scalar'), scalarValues);

  const fields = ensureMap(tableDoc, 'fields');
  const fieldIds = (state.rows ?? []).map(fieldIdForRow);
  (state.rows ?? []).forEach((row, index) => {
    const values: JsonRecord = {};
    for (const key of FIELD_KEYS) {
      values[key] = row[key];
    }
    writeJsonMap(ensureMap(fields, fieldIds[index]), values);
  });
  syncStringArray(ensureArray(tableDoc, 'fieldOrder'), fieldIds);

  writeOrderedMap(tableDoc, 'indexes', 'indexOrder', state.indexes ?? []);
  writeOrderedMap(tableDoc, 'foreignKeys', 'foreignKeyOrder', state.foreignKeys ?? []);
};

const upsertTableRecord = (
  collection: Y.Map<Y.Map<unknown>>,
  key: string,
  state: PersistedState,
  metadata: JsonRecord,
) => {
  const tableDoc = ensureMap(collection, key);
  applyPersistedStateToTableDoc(tableDoc, state);
  writeJsonMap(ensureMap(tableDoc, 'metadata'), metadata);
};

export const createWorkspaceYDocUpdateFromSnapshot = (snapshot: WorkspaceSnapshot) => {
  const doc = new Y.Doc();
  const meta = doc.getMap('meta');
  meta.set('schemaVersion', WORKSPACE_YDOC_SCHEMA_VERSION);
  const drafts = doc.getMap<Y.Map<unknown>>('drafts');
  const savedTables = doc.getMap<Y.Map<unknown>>('savedTables');
  const savedDrafts = doc.getMap<Y.Map<unknown>>('savedDrafts');
  const folders = doc.getMap<Y.Map<unknown>>('folders');

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
      createdAt: table.createdAt,
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
    writeJsonMap(ensureMap(folders, folder.id), folder as JsonRecord);
  }

  return Y.encodeStateAsUpdate(doc);
};
