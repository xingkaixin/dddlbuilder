import * as Y from 'yjs';
import type {
  FieldRow,
  ForeignKeyDefinition,
  IndexDefinition,
  PersistedState,
} from '@ddlbuilder/shared-types';
import type {
  SavedTableDraftRecord,
  WorkspaceSnapshot,
  WorkspaceSource,
} from '@ddlbuilder/shared-types/workspace';
import type { SavedTableMetadata, SavedTableRecord, TableFolder } from '@/utils/savedTablesDb';
import type { FolderTreeNode } from '@/utils/tableFolders';
import { DEFAULT_DRAFT_ID } from '@/utils/workspaceStateDb';

export const WORKSPACE_YDOC_SCHEMA_VERSION = 1;

type JsonRecord = Record<string, unknown>;

export type WorkspaceYDocDraftRecord = {
  state: PersistedState;
  createdAt?: number;
  updatedAt: number;
  folderId?: string;
};

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

const getWorkspaceRoot = (doc: Y.Doc) => ({
  meta: doc.getMap('meta'),
  drafts: doc.getMap<Y.Map<unknown>>('drafts'),
  savedTables: doc.getMap<Y.Map<unknown>>('savedTables'),
  savedDrafts: doc.getMap<Y.Map<unknown>>('savedDrafts'),
  folders: doc.getMap<Y.Map<unknown>>('folders'),
});

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
  const nextKeys = new Set(Object.keys(values));
  for (const key of Array.from(map.keys())) {
    if (!nextKeys.has(key)) {
      map.delete(key);
    }
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      map.delete(key);
      continue;
    }
    if (JSON.stringify(map.get(key)) !== JSON.stringify(value)) {
      map.set(key, value);
    }
  }
};

const readJsonMap = (map: Y.Map<unknown> | undefined): JsonRecord => {
  if (!map) return {};
  const record: JsonRecord = {};
  for (const [key, value] of map.entries()) {
    record[key] = value;
  }
  return record;
};

const syncStringArray = (array: Y.Array<string>, values: string[]) => {
  const current = array.toArray();
  if (
    current.length === values.length &&
    current.every((value, index) => value === values[index])
  ) {
    return;
  }
  array.delete(0, current.length);
  if (values.length > 0) {
    array.insert(0, values);
  }
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
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

const rowIdentity = (row: FieldRow) => {
  const { order: _order, ...rest } = row;
  return stableStringify(rest);
};

const fieldIdForRow = (row: FieldRow, index: number) =>
  `field_${index + 1}_${hashString(rowIdentity(row))}`;

const uniqueFieldId = (baseId: string, used: Set<string>) => {
  if (!used.has(baseId)) return baseId;
  let suffix = 2;
  while (used.has(`${baseId}_${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}_${suffix}`;
};

const readFieldRow = (fieldMap: Y.Map<unknown>, fallbackOrder: number): FieldRow => {
  const row = readJsonMap(fieldMap) as Partial<FieldRow>;
  return {
    order: typeof row.order === 'number' ? row.order : fallbackOrder,
    fieldName: typeof row.fieldName === 'string' ? row.fieldName : '',
    fieldType: typeof row.fieldType === 'string' ? row.fieldType : '',
    fieldComment: typeof row.fieldComment === 'string' ? row.fieldComment : '',
    nullable: typeof row.nullable === 'string' ? row.nullable : '是',
    ...(typeof row.defaultKind === 'string' ? { defaultKind: row.defaultKind } : {}),
    ...(typeof row.defaultValue === 'string' ? { defaultValue: row.defaultValue } : {}),
    ...(typeof row.onUpdate === 'string' ? { onUpdate: row.onUpdate } : {}),
    ...(Array.isArray(row.enumMeta) ? { enumMeta: row.enumMeta } : {}),
  };
};

const chooseFieldIds = (tableDoc: Y.Map<unknown>, rows: FieldRow[]) => {
  const fieldOrder = ensureArray(tableDoc, 'fieldOrder').toArray();
  const fields = ensureMap(tableDoc, 'fields') as Y.Map<Y.Map<unknown>>;
  const existingByIdentity = new Map<string, string[]>();
  const existingByOrder = new Map<number, string[]>();

  fieldOrder.forEach((fieldId, index) => {
    const fieldMap = fields.get(fieldId);
    if (!fieldMap) return;
    const row = readFieldRow(fieldMap, index + 1);
    const identity = rowIdentity(row);
    existingByIdentity.set(identity, [...(existingByIdentity.get(identity) ?? []), fieldId]);
    existingByOrder.set(row.order, [...(existingByOrder.get(row.order) ?? []), fieldId]);
  });

  const used = new Set<string>();
  return rows.map((row, index) => {
    const identityCandidates = existingByIdentity.get(rowIdentity(row)) ?? [];
    const byIdentity = identityCandidates.find((fieldId) => !used.has(fieldId));
    if (byIdentity) {
      used.add(byIdentity);
      return byIdentity;
    }

    const orderCandidates = existingByOrder.get(row.order) ?? [];
    const byOrder = orderCandidates.find((fieldId) => !used.has(fieldId));
    if (byOrder) {
      used.add(byOrder);
      return byOrder;
    }

    const byPosition = fieldOrder[index];
    if (byPosition && !used.has(byPosition)) {
      used.add(byPosition);
      return byPosition;
    }

    const generated = uniqueFieldId(fieldIdForRow(row, index), used);
    used.add(generated);
    return generated;
  });
};

const writeOrderedMap = <T extends { id: string }>(
  parent: Y.Map<any>,
  mapKey: string,
  orderKey: string,
  values: T[],
) => {
  const map = ensureMap(parent, mapKey) as Y.Map<Y.Map<unknown>>;
  const order = ensureArray(parent, orderKey);
  const ids = values.map((value) => value.id);
  const idSet = new Set(ids);
  for (const key of Array.from(map.keys())) {
    if (!idSet.has(key)) {
      map.delete(key);
    }
  }
  for (const value of values) {
    const itemMap = ensureMap(map, value.id);
    writeJsonMap(itemMap, value as JsonRecord);
  }
  syncStringArray(order, ids);
};

const readOrderedMap = <T>(parent: Y.Map<any>, mapKey: string, orderKey: string): T[] => {
  const map = parent.get(mapKey);
  const order = parent.get(orderKey);
  if (!(map instanceof Y.Map) || !(order instanceof Y.Array)) return [];
  return order
    .toArray()
    .map((id) => {
      const itemMap = map.get(String(id));
      return itemMap instanceof Y.Map ? (readJsonMap(itemMap) as T) : null;
    })
    .filter((item): item is T => item != null);
};

export const ensureWorkspaceYDocMeta = (doc: Y.Doc) => {
  const { meta } = getWorkspaceRoot(doc);
  if (meta.get('schemaVersion') !== WORKSPACE_YDOC_SCHEMA_VERSION) {
    meta.set('schemaVersion', WORKSPACE_YDOC_SCHEMA_VERSION);
  }
};

export const applyPersistedStateToTableDoc = (tableDoc: Y.Map<unknown>, state: PersistedState) => {
  const scalar = ensureMap(tableDoc, 'scalar');
  const scalarValues: JsonRecord = {};
  for (const key of TABLE_SCALAR_KEYS) {
    scalarValues[key] = state[key];
  }
  writeJsonMap(scalar, scalarValues);

  const fields = ensureMap(tableDoc, 'fields') as Y.Map<Y.Map<unknown>>;
  const fieldOrder = ensureArray(tableDoc, 'fieldOrder');
  const fieldIds = chooseFieldIds(tableDoc, state.rows ?? []);
  const activeFieldIds = new Set(fieldIds);
  for (const fieldId of Array.from(fields.keys())) {
    if (!activeFieldIds.has(fieldId)) {
      fields.delete(fieldId);
    }
  }
  (state.rows ?? []).forEach((row, index) => {
    const fieldMap = ensureMap(fields, fieldIds[index]);
    const values: JsonRecord = {};
    for (const key of FIELD_KEYS) {
      values[key] = row[key];
    }
    writeJsonMap(fieldMap, values);
  });
  syncStringArray(fieldOrder, fieldIds);

  writeOrderedMap(tableDoc, 'indexes', 'indexOrder', state.indexes ?? []);
  writeOrderedMap(tableDoc, 'foreignKeys', 'foreignKeyOrder', state.foreignKeys ?? []);
};

export const tableDocToPersistedState = (tableDoc: Y.Map<unknown>): PersistedState => {
  const scalar = ensureMap(tableDoc, 'scalar');
  const state = readJsonMap(scalar) as Partial<PersistedState>;
  const fields = ensureMap(tableDoc, 'fields') as Y.Map<Y.Map<unknown>>;
  const fieldOrder = ensureArray(tableDoc, 'fieldOrder').toArray();
  const rows = fieldOrder
    .map((fieldId, index) => {
      const fieldMap = fields.get(fieldId);
      return fieldMap ? readFieldRow(fieldMap, index + 1) : null;
    })
    .filter((row): row is FieldRow => row != null)
    .map((row, index) => ({ ...row, order: index + 1 }));

  return {
    objectType: state.objectType === 'view' ? 'view' : 'table',
    schemaName: typeof state.schemaName === 'string' ? state.schemaName : '',
    tableName: typeof state.tableName === 'string' ? state.tableName : '',
    tableComment: typeof state.tableComment === 'string' ? state.tableComment : '',
    dbType: typeof state.dbType === 'string' ? state.dbType : 'mysql',
    sqlFormatMode: state.sqlFormatMode === 'aligned' ? 'aligned' : 'compact',
    viewDefinition: typeof state.viewDefinition === 'string' ? state.viewDefinition : '',
    viewCreateOrReplace: state.viewCreateOrReplace !== false,
    rows,
    addCount: typeof state.addCount === 'number' ? state.addCount : 12,
    indexInput: typeof state.indexInput === 'string' ? state.indexInput : '',
    currentIndexFields: Array.isArray(state.currentIndexFields) ? state.currentIndexFields : [],
    indexes: readOrderedMap<IndexDefinition>(tableDoc, 'indexes', 'indexOrder'),
    authInput: typeof state.authInput === 'string' ? state.authInput : '',
    authObjects: Array.isArray(state.authObjects) ? state.authObjects : [],
    ...(state.citusShardingConfig ? { citusShardingConfig: state.citusShardingConfig } : {}),
    ...(state.mysqlPartitionConfig ? { mysqlPartitionConfig: state.mysqlPartitionConfig } : {}),
    ...(state.tableMiscConfig ? { tableMiscConfig: state.tableMiscConfig } : {}),
    ...(state.fieldTableViewConfig ? { fieldTableViewConfig: state.fieldTableViewConfig } : {}),
    foreignKeys: readOrderedMap<ForeignKeyDefinition>(tableDoc, 'foreignKeys', 'foreignKeyOrder'),
  } as PersistedState;
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

const tableMetadata = (tableDoc: Y.Map<unknown>) => readJsonMap(ensureMap(tableDoc, 'metadata'));

export const upsertDraftInYDoc = (
  doc: Y.Doc,
  draftId: string,
  record: WorkspaceYDocDraftRecord,
) => {
  const { drafts } = getWorkspaceRoot(doc);
  upsertTableRecord(drafts, draftId, record.state, {
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    folderId: record.folderId,
  });
};

export const deleteDraftFromYDoc = (doc: Y.Doc, draftId: string) => {
  getWorkspaceRoot(doc).drafts.delete(draftId);
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

export const listDraftRecordsFromYDoc = (doc: Y.Doc) =>
  Array.from(getWorkspaceRoot(doc).drafts.entries()).map(([draftId, tableDoc]) => ({
    draftId,
    record: getDraftRecordFromYDoc(doc, draftId) ?? {
      state: tableDocToPersistedState(tableDoc),
      updatedAt: Date.now(),
    },
  }));

export const upsertSavedTableInYDoc = (doc: Y.Doc, record: SavedTableRecord) => {
  const { savedTables } = getWorkspaceRoot(doc);
  upsertTableRecord(savedTables, record.normalizedName, record.state, {
    normalizedName: record.normalizedName,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    folderId: record.folderId,
  });
};

export const deleteSavedTableFromYDoc = (doc: Y.Doc, normalizedName: string) => {
  getWorkspaceRoot(doc).savedTables.delete(normalizedName);
};

export const getSavedTableFromYDoc = (
  doc: Y.Doc,
  normalizedName: string,
): SavedTableRecord | null => {
  const tableDoc = getWorkspaceRoot(doc).savedTables.get(normalizedName);
  if (!tableDoc) return null;
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
};

export const listSavedTableMetadataFromYDoc = (doc: Y.Doc): SavedTableMetadata[] =>
  Array.from(getWorkspaceRoot(doc).savedTables.keys())
    .map((normalizedName) => getSavedTableFromYDoc(doc, normalizedName))
    .filter((record): record is SavedTableRecord => record != null)
    .map((record) => ({
      normalizedName: record.normalizedName,
      name: record.name,
      dbType: record.state.dbType,
      fieldCount: record.state.rows.filter((row) => row.fieldName.trim()).length,
      folderId: record.folderId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));

export const upsertSavedDraftInYDoc = (
  doc: Y.Doc,
  normalizedName: string,
  record: SavedTableDraftRecord,
) => {
  const { savedDrafts } = getWorkspaceRoot(doc);
  upsertTableRecord(savedDrafts, normalizedName, record.state, {
    normalizedName,
    tableName: record.tableName,
    baseSignature: record.baseSignature,
    updatedAt: record.updatedAt,
  });
};

export const deleteSavedDraftFromYDoc = (doc: Y.Doc, normalizedName: string) => {
  getWorkspaceRoot(doc).savedDrafts.delete(normalizedName);
};

export const getSavedDraftFromYDoc = (
  doc: Y.Doc,
  normalizedName: string,
): SavedTableDraftRecord | null => {
  const tableDoc = getWorkspaceRoot(doc).savedDrafts.get(normalizedName);
  if (!tableDoc) return null;
  const metadata = tableMetadata(tableDoc);
  return {
    state: tableDocToPersistedState(tableDoc),
    tableName: typeof metadata.tableName === 'string' ? metadata.tableName : normalizedName,
    baseSignature: typeof metadata.baseSignature === 'string' ? metadata.baseSignature : '',
    updatedAt: typeof metadata.updatedAt === 'number' ? metadata.updatedAt : Date.now(),
  };
};

export const listSavedDraftsFromYDoc = (doc: Y.Doc) => {
  const entries: Array<[string, SavedTableDraftRecord]> = [];
  for (const normalizedName of getWorkspaceRoot(doc).savedDrafts.keys()) {
    const record = getSavedDraftFromYDoc(doc, normalizedName);
    if (record) entries.push([normalizedName, record]);
  }
  return new Map(entries);
};

export const upsertFolderInYDoc = (doc: Y.Doc, folder: TableFolder) => {
  const folderMap = ensureMap(getWorkspaceRoot(doc).folders, folder.id);
  writeJsonMap(folderMap, folder as JsonRecord);
};

export const deleteFolderFromYDoc = (doc: Y.Doc, folderId: string) => {
  getWorkspaceRoot(doc).folders.delete(folderId);
};

export const listFoldersFromYDoc = (doc: Y.Doc): TableFolder[] => {
  const folders: TableFolder[] = [];
  for (const [id, map] of getWorkspaceRoot(doc).folders.entries()) {
    const record = readJsonMap(map);
    if (typeof record.name !== 'string') continue;
    folders.push({
      id,
      name: record.name,
      parentId: typeof record.parentId === 'string' ? record.parentId : undefined,
      order: typeof record.order === 'number' ? record.order : 0,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
    });
  }
  return folders.sort((a, b) => a.order - b.order);
};

export const buildFolderTreeFromYDoc = (doc: Y.Doc): FolderTreeNode[] => {
  const folders = listFoldersFromYDoc(doc);
  const folderMap = new Map<string, FolderTreeNode>();
  for (const folder of folders) {
    folderMap.set(folder.id, { ...folder, children: [] });
  }
  const roots: FolderTreeNode[] = [];
  for (const folder of folders) {
    const node = folderMap.get(folder.id);
    if (!node) continue;
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
};

export const importWorkspaceSnapshotToYDoc = (doc: Y.Doc, snapshot: WorkspaceSnapshot) => {
  doc.transact(() => {
    ensureWorkspaceYDocMeta(doc);
    if (snapshot.globalDraft) {
      upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, snapshot.globalDraft);
    }
    for (const draft of snapshot.drafts) {
      upsertDraftInYDoc(doc, draft.draftId, draft);
    }
    for (const table of snapshot.savedTables) {
      upsertSavedTableInYDoc(doc, {
        normalizedName: table.normalizedName,
        name: table.name,
        state: table.state,
        createdAt: table.createdAt ?? table.updatedAt,
        updatedAt: table.updatedAt,
        folderId: table.folderId,
      });
    }
    for (const draft of snapshot.savedDrafts) {
      upsertSavedDraftInYDoc(doc, draft.normalizedName, draft);
    }
    for (const folder of snapshot.folders) {
      upsertFolderInYDoc(doc, folder);
    }
  });
};

export const exportWorkspaceYDocToSnapshot = (doc: Y.Doc): WorkspaceSnapshot => {
  const draftRecords = listDraftRecordsFromYDoc(doc);
  return {
    globalDraft: null,
    drafts: draftRecords.map(({ draftId, record }) => ({
      draftId,
      state: record.state,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      folderId: record.folderId,
    })),
    savedTables: Array.from(getWorkspaceRoot(doc).savedTables.keys())
      .map((normalizedName) => getSavedTableFromYDoc(doc, normalizedName))
      .filter((record): record is SavedTableRecord => record != null)
      .map((record) => ({
        normalizedName: record.normalizedName,
        name: record.name,
        state: record.state,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        folderId: record.folderId,
      })),
    savedDrafts: Array.from(listSavedDraftsFromYDoc(doc).entries()).map(
      ([normalizedName, record]) => ({
        normalizedName,
        tableName: record.tableName,
        state: record.state,
        updatedAt: record.updatedAt,
        baseSignature: record.baseSignature,
      }),
    ),
    folders: listFoldersFromYDoc(doc),
  };
};

export const isWorkspaceYDocEmpty = (doc: Y.Doc) => {
  const { drafts, savedTables, savedDrafts, folders } = getWorkspaceRoot(doc);
  return (
    drafts.size === 0 && savedTables.size === 0 && savedDrafts.size === 0 && folders.size === 0
  );
};

export const getStateForWorkspaceSource = (
  doc: Y.Doc,
  source: WorkspaceSource,
): PersistedState | null => {
  if (source.kind === 'draft') {
    return getDraftRecordFromYDoc(doc, source.draftId)?.state ?? null;
  }
  return getSavedTableFromYDoc(doc, source.normalizedName)?.state ?? null;
};

export const subscribeWorkspaceYDoc = (doc: Y.Doc, notify: () => void) => {
  const roots = Object.values(getWorkspaceRoot(doc));
  roots.forEach((root) => root.observeDeep(notify));
  return () => {
    roots.forEach((root) => root.unobserveDeep(notify));
  };
};
