import * as Y from 'yjs';
import type {
  FieldRow,
  ForeignKeyDefinition,
  IndexDefinition,
  PersistedState,
} from '@ddlbuilder/shared-types';
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

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
};

const writeJsonMap = (map: Y.Map<unknown>, values: JsonRecord) => {
  const keys = new Set(Object.keys(values));
  for (const key of Array.from(map.keys())) {
    if (!keys.has(key)) map.delete(key);
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      map.delete(key);
    } else if (stableStringify(map.get(key)) !== stableStringify(value)) {
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

const writeStateSnapshot = (tableDoc: Y.Map<unknown>, state: PersistedState) => {
  tableDoc.set('stateSnapshot', JSON.parse(JSON.stringify(state)));
};

const readStateSnapshot = (tableDoc: Y.Map<unknown>): PersistedState | null => {
  const snapshot = tableDoc.get('stateSnapshot');
  if (!snapshot || typeof snapshot !== 'object') return null;
  const state = snapshot as Partial<PersistedState>;
  if (!Array.isArray(state.rows)) return null;
  return state as PersistedState;
};

const hasFineGrainedTableDoc = (tableDoc: Y.Map<unknown>) =>
  tableDoc.get('scalar') instanceof Y.Map ||
  tableDoc.get('fields') instanceof Y.Map ||
  tableDoc.get('fieldOrder') instanceof Y.Array ||
  tableDoc.get('indexes') instanceof Y.Map ||
  tableDoc.get('indexOrder') instanceof Y.Array ||
  tableDoc.get('foreignKeys') instanceof Y.Map ||
  tableDoc.get('foreignKeyOrder') instanceof Y.Array;

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

const fieldIdForRow = (row: FieldRow, index: number) => {
  return `field_${index + 1}_${hashString(rowIdentity(row))}`;
};

const uniqueFieldId = (baseId: string, used: Set<string>) => {
  if (!used.has(baseId)) return baseId;
  let suffix = 2;
  while (used.has(`${baseId}_${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}_${suffix}`;
};

const syncStringArray = (array: Y.Array<string>, values: string[]) => {
  const current = array.toArray();
  if (
    current.length === values.length &&
    current.every((value, index) => value === values[index])
  ) {
    return;
  }
  array.delete(0, array.length);
  if (values.length > 0) array.insert(0, values);
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
  const map = ensureMap(parent, mapKey);
  const order = ensureArray(parent, orderKey);
  const ids = values.map((value) => value.id);
  const idSet = new Set(ids);
  for (const key of Array.from(map.keys())) {
    if (!idSet.has(key)) {
      map.delete(key);
    }
  }
  for (const value of values) {
    writeJsonMap(ensureMap(map, value.id), value as JsonRecord);
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

const applyPersistedStateToTableDoc = (tableDoc: Y.Map<unknown>, state: PersistedState) => {
  writeStateSnapshot(tableDoc, state);

  const scalarValues: JsonRecord = {};
  for (const key of TABLE_SCALAR_KEYS) {
    scalarValues[key] = state[key];
  }
  writeJsonMap(ensureMap(tableDoc, 'scalar'), scalarValues);

  const fields = ensureMap(tableDoc, 'fields');
  const fieldIds = chooseFieldIds(tableDoc, state.rows ?? []);
  const activeFieldIds = new Set(fieldIds);
  for (const fieldId of Array.from(fields.keys())) {
    if (!activeFieldIds.has(fieldId)) {
      fields.delete(fieldId);
    }
  }
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

const tableDocToPersistedState = (tableDoc: Y.Map<unknown>): PersistedState => {
  if (!hasFineGrainedTableDoc(tableDoc)) {
    const stateSnapshot = readStateSnapshot(tableDoc);
    if (stateSnapshot) return stateSnapshot;
  }

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

export const importWorkspaceSnapshotToYDoc = (doc: Y.Doc, snapshot: WorkspaceSnapshot) => {
  doc.transact(() => {
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
      writeJsonMap(ensureMap(folders, folder.id), folder as JsonRecord);
    }
  });
};

export const createWorkspaceYDocUpdateFromSnapshot = (snapshot: WorkspaceSnapshot) => {
  const doc = new Y.Doc();
  importWorkspaceSnapshotToYDoc(doc, snapshot);
  return Y.encodeStateAsUpdate(doc);
};

const tableMetadata = (tableDoc: Y.Map<unknown>) => readJsonMap(ensureMap(tableDoc, 'metadata'));

const getDraftRecordFromYDoc = (doc: Y.Doc, draftId: string) => {
  const tableDoc = doc.getMap<Y.Map<unknown>>('drafts').get(draftId);
  if (!tableDoc) return null;
  const metadata = tableMetadata(tableDoc);
  return {
    state: tableDocToPersistedState(tableDoc),
    createdAt: typeof metadata.createdAt === 'number' ? metadata.createdAt : undefined,
    updatedAt: typeof metadata.updatedAt === 'number' ? metadata.updatedAt : Date.now(),
    ...(typeof metadata.folderId === 'string' ? { folderId: metadata.folderId } : {}),
  };
};

export const exportWorkspaceYDocToSnapshot = (doc: Y.Doc): WorkspaceSnapshot => {
  const drafts = doc.getMap<Y.Map<unknown>>('drafts');
  const savedTables = doc.getMap<Y.Map<unknown>>('savedTables');
  const savedDrafts = doc.getMap<Y.Map<unknown>>('savedDrafts');
  const folders = doc.getMap<Y.Map<unknown>>('folders');

  return {
    globalDraft: null,
    drafts: Array.from(drafts.keys()).map((draftId) => {
      const record = getDraftRecordFromYDoc(doc, draftId);
      return {
        draftId,
        state: record?.state ?? tableDocToPersistedState(drafts.get(draftId) ?? new Y.Map()),
        createdAt: record?.createdAt,
        updatedAt: record?.updatedAt ?? Date.now(),
        folderId: record?.folderId,
      };
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
    folders: Array.from(folders.entries())
      .map(([id, map]) => {
        const record = readJsonMap(map);
        if (typeof record.name !== 'string') return null;
        return {
          id,
          name: record.name,
          ...(typeof record.parentId === 'string' ? { parentId: record.parentId } : {}),
          order: typeof record.order === 'number' ? record.order : 0,
          createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
        };
      })
      .filter((folder): folder is WorkspaceSnapshot['folders'][number] => folder != null)
      .sort((a, b) => a.order - b.order),
  };
};

export const isWorkspaceYDocInitialized = (doc: Y.Doc) =>
  doc.getMap('meta').get('schemaVersion') != null;
