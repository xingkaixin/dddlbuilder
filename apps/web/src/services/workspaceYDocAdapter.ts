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
import {
  exportWorkspaceYDocToSnapshot as encodeWorkspaceSnapshot,
  importWorkspaceSnapshotToYDoc as decodeWorkspaceSnapshot,
} from '@ddlbuilder/workspace-core';
import type { SavedTableMetadata, SavedTableRecord, TableFolder } from '@/utils/savedTablesDb';
import type { FolderTreeNode } from '@/utils/tableFolders';
import { DEFAULT_DRAFT_ID } from '@/utils/workspaceStateDb';

export const WORKSPACE_YDOC_SCHEMA_VERSION = 1;
export const WORKSPACE_YDOC_LOCAL_EDIT_ORIGIN = { source: 'workspace-local-edit' } as const;

type JsonRecord = Record<string, unknown>;
type ApplyPersistedStateOptions = {
  compactSnapshotBase?: boolean;
  forceFineGrained?: boolean;
};

export type WorkspaceYDocDraftRecord = {
  state: PersistedState;
  createdAt?: number;
  updatedAt: number;
  folderId?: string;
};

export type WorkspaceYDocCollection = 'drafts' | 'savedTables' | 'savedDrafts' | 'folders';

export type WorkspaceYDocChange = {
  collection: WorkspaceYDocCollection;
  entityIds: ReadonlySet<string>;
  origin: unknown;
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

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
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
    if (stableStringify(map.get(key)) !== stableStringify(value)) {
      map.set(key, value);
    }
  }
};

const writeJsonMapPatch = (map: Y.Map<unknown>, values: JsonRecord) => {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      map.delete(key);
      continue;
    }
    if (stableStringify(map.get(key)) !== stableStringify(value)) {
      map.set(key, value);
    }
  }
};

const writeStateSnapshot = (tableDoc: Y.Map<unknown>, state: PersistedState) => {
  const nextSnapshot = JSON.parse(JSON.stringify(state));
  if (stableStringify(tableDoc.get('stateSnapshot')) !== stableStringify(nextSnapshot)) {
    tableDoc.set('stateSnapshot', nextSnapshot);
  }
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

const readJsonMap = (map: Y.Map<unknown> | undefined): JsonRecord => {
  if (!map) return {};
  const record: JsonRecord = {};
  for (const [key, value] of map.entries()) {
    record[key] = value;
  }
  return record;
};

const uniqueValues = <T>(values: T[]) => Array.from(new Set(values));

const getFieldOrder = (tableDoc: Y.Map<unknown>) => {
  const fieldOrder = tableDoc.get('fieldOrder');
  return fieldOrder instanceof Y.Array ? uniqueValues(fieldOrder.toArray()) : [];
};

const getFields = (tableDoc: Y.Map<unknown>) => {
  const fields = tableDoc.get('fields');
  return fields instanceof Y.Map ? (fields as Y.Map<Y.Map<unknown>>) : null;
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

const fallbackFieldIds = (rows: FieldRow[]) => {
  const used = new Set<string>();
  return rows.map((row, index) => {
    const fieldId = uniqueFieldId(fieldIdForRow(row, index), used);
    used.add(fieldId);
    return fieldId;
  });
};

const readFieldRow = (
  fieldMap: Y.Map<unknown>,
  fallbackOrder: number,
  fallbackRow?: FieldRow,
): FieldRow => {
  const row = readJsonMap(fieldMap) as Partial<FieldRow>;
  const fallback: Partial<FieldRow> = fallbackRow ?? {};
  return {
    order:
      typeof row.order === 'number'
        ? row.order
        : typeof fallback.order === 'number'
          ? fallback.order
          : fallbackOrder,
    fieldName:
      typeof row.fieldName === 'string'
        ? row.fieldName
        : typeof fallback.fieldName === 'string'
          ? fallback.fieldName
          : '',
    fieldType:
      typeof row.fieldType === 'string'
        ? row.fieldType
        : typeof fallback.fieldType === 'string'
          ? fallback.fieldType
          : '',
    fieldComment:
      typeof row.fieldComment === 'string'
        ? row.fieldComment
        : typeof fallback.fieldComment === 'string'
          ? fallback.fieldComment
          : '',
    nullable:
      typeof row.nullable === 'string'
        ? row.nullable
        : typeof fallback.nullable === 'string'
          ? fallback.nullable
          : '是',
    ...(typeof row.defaultKind === 'string'
      ? { defaultKind: row.defaultKind }
      : typeof fallback.defaultKind === 'string'
        ? { defaultKind: fallback.defaultKind }
        : {}),
    ...(typeof row.defaultValue === 'string'
      ? { defaultValue: row.defaultValue }
      : typeof fallback.defaultValue === 'string'
        ? { defaultValue: fallback.defaultValue }
        : {}),
    ...(typeof row.onUpdate === 'string'
      ? { onUpdate: row.onUpdate }
      : typeof fallback.onUpdate === 'string'
        ? { onUpdate: fallback.onUpdate }
        : {}),
    ...(Array.isArray(row.enumMeta)
      ? { enumMeta: row.enumMeta }
      : Array.isArray(fallback.enumMeta)
        ? { enumMeta: fallback.enumMeta }
        : {}),
  };
};

const addFieldIdCandidate = (
  byIdentity: Map<string, string[]>,
  byOrder: Map<number, string[]>,
  row: FieldRow,
  fieldId: string,
) => {
  const identity = rowIdentity(row);
  byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), fieldId]);
  byOrder.set(row.order, [...(byOrder.get(row.order) ?? []), fieldId]);
};

const chooseFieldIds = (
  tableDoc: Y.Map<unknown>,
  rows: FieldRow[],
  fallbackRows: FieldRow[] = [],
) => {
  const fieldOrder = getFieldOrder(tableDoc);
  const fields = getFields(tableDoc);
  const existingByIdentity = new Map<string, string[]>();
  const existingByOrder = new Map<number, string[]>();

  fieldOrder.forEach((fieldId, index) => {
    const fieldMap = fields?.get(fieldId);
    if (!fieldMap) return;
    addFieldIdCandidate(
      existingByIdentity,
      existingByOrder,
      readFieldRow(fieldMap, index + 1),
      fieldId,
    );
  });

  const fieldIds = fallbackFieldIds(fallbackRows);
  fallbackRows.forEach((row, index) => {
    const fieldId = fieldIds[index];
    addFieldIdCandidate(existingByIdentity, existingByOrder, row, fieldId);
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
  return uniqueValues(order.toArray())
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

export const applyPersistedStateToTableDoc = (
  tableDoc: Y.Map<unknown>,
  state: PersistedState,
  options: ApplyPersistedStateOptions = {},
) => {
  const previousSnapshot = readStateSnapshot(tableDoc);
  const compactSnapshotBase = options.compactSnapshotBase === true;
  const forceFineGrained = options.forceFineGrained === true;
  const existingScalar = tableDoc.get('scalar');
  const scalarMap = existingScalar instanceof Y.Map ? existingScalar : null;
  if (!compactSnapshotBase || !previousSnapshot) {
    writeStateSnapshot(tableDoc, state);
  }

  const scalarValues: JsonRecord = {};
  for (const key of TABLE_SCALAR_KEYS) {
    if (
      !forceFineGrained &&
      previousSnapshot &&
      stableStringify(previousSnapshot[key]) === stableStringify(state[key])
    ) {
      if (
        !scalarMap?.has(key) ||
        stableStringify(scalarMap.get(key)) === stableStringify(state[key])
      ) {
        continue;
      }
    }
    scalarValues[key] = state[key];
  }
  if (!previousSnapshot) {
    const scalar = ensureMap(tableDoc, 'scalar');
    writeJsonMap(scalar, scalarValues);
  } else if (Object.keys(scalarValues).length > 0) {
    const scalar = ensureMap(tableDoc, 'scalar');
    writeJsonMapPatch(scalar, scalarValues);
  }

  const previousRows = previousSnapshot?.rows ?? [];
  const fieldIds = chooseFieldIds(tableDoc, state.rows ?? [], previousRows);
  const previousFieldIds = fallbackFieldIds(previousRows);
  const existingFields = getFields(tableDoc);
  const fieldPatches = (state.rows ?? []).map((row, index) => {
    const fieldMap = existingFields?.get(fieldIds[index]);
    const values: JsonRecord = {};
    for (const key of FIELD_KEYS) {
      if (
        !forceFineGrained &&
        previousRows[index] &&
        stableStringify(previousRows[index][key]) === stableStringify(row[key])
      ) {
        if (
          !fieldMap?.has(key) ||
          stableStringify(fieldMap.get(key)) === stableStringify(row[key])
        ) {
          continue;
        }
      }
      values[key] = row[key];
    }
    return values;
  });
  const hasFieldValueChanges = fieldPatches.some((values) =>
    Object.values(values).some((value) => value !== undefined),
  );
  const hasFieldStructuralChanges =
    previousRows.length !== (state.rows ?? []).length ||
    fieldIds.some((fieldId, index) => fieldId !== previousFieldIds[index]);
  const shouldWriteFields =
    !previousSnapshot ||
    hasFieldValueChanges ||
    hasFieldStructuralChanges ||
    (!compactSnapshotBase && fieldPatches.some((values) => Object.keys(values).length > 0));

  if (shouldWriteFields) {
    const fields = ensureMap(tableDoc, 'fields') as Y.Map<Y.Map<unknown>>;
    const fieldOrder = ensureArray(tableDoc, 'fieldOrder');
    const activeFieldIds = new Set(fieldIds);
    for (const fieldId of Array.from(fields.keys())) {
      if (!activeFieldIds.has(fieldId)) {
        fields.delete(fieldId);
      }
    }
    (state.rows ?? []).forEach((_, index) => {
      const fieldMap = ensureMap(fields, fieldIds[index]);
      const values = fieldPatches[index];
      if (!previousRows[index]) {
        writeJsonMap(fieldMap, values);
      } else if (Object.keys(values).length > 0) {
        writeJsonMapPatch(fieldMap, values);
      }
    });
    syncStringArray(fieldOrder, fieldIds);
  }

  const hasIndexDoc =
    tableDoc.get('indexes') instanceof Y.Map || tableDoc.get('indexOrder') instanceof Y.Array;
  if (
    forceFineGrained ||
    !previousSnapshot ||
    hasIndexDoc ||
    stableStringify(previousSnapshot.indexes ?? []) !== stableStringify(state.indexes ?? [])
  ) {
    writeOrderedMap(tableDoc, 'indexes', 'indexOrder', state.indexes ?? []);
  }
  const hasForeignKeyDoc =
    tableDoc.get('foreignKeys') instanceof Y.Map ||
    tableDoc.get('foreignKeyOrder') instanceof Y.Array;
  if (
    forceFineGrained ||
    !previousSnapshot ||
    hasForeignKeyDoc ||
    stableStringify(previousSnapshot.foreignKeys ?? []) !== stableStringify(state.foreignKeys ?? [])
  ) {
    writeOrderedMap(tableDoc, 'foreignKeys', 'foreignKeyOrder', state.foreignKeys ?? []);
  }
};

const materializeTableDoc = (tableDoc: Y.Map<unknown>) => {
  if (hasFineGrainedTableDoc(tableDoc)) return false;
  const stateSnapshot = readStateSnapshot(tableDoc);
  if (!stateSnapshot) return false;
  applyPersistedStateToTableDoc(tableDoc, stateSnapshot, { forceFineGrained: true });
  return true;
};

export const materializeWorkspaceYDoc = (doc: Y.Doc) => {
  const { drafts, savedTables, savedDrafts } = getWorkspaceRoot(doc);
  let materialized = false;
  for (const tableDoc of drafts.values()) {
    materialized = materializeTableDoc(tableDoc) || materialized;
  }
  for (const tableDoc of savedTables.values()) {
    materialized = materializeTableDoc(tableDoc) || materialized;
  }
  for (const tableDoc of savedDrafts.values()) {
    materialized = materializeTableDoc(tableDoc) || materialized;
  }
  return materialized;
};

export const tableDocToPersistedState = (tableDoc: Y.Map<unknown>): PersistedState => {
  const stateSnapshot = readStateSnapshot(tableDoc);
  if (!hasFineGrainedTableDoc(tableDoc)) {
    if (stateSnapshot) return stateSnapshot;
  }

  const scalarValue = tableDoc.get('scalar');
  const state = {
    ...stateSnapshot,
    ...(scalarValue instanceof Y.Map ? readJsonMap(scalarValue) : {}),
  } as Partial<PersistedState>;
  const fields = getFields(tableDoc);
  const fieldOrder = getFieldOrder(tableDoc);
  const hasFieldDoc = fields != null || tableDoc.get('fieldOrder') instanceof Y.Array;
  const rows = hasFieldDoc
    ? fields
      ? fieldOrder
          .map((fieldId, index) => {
            const fieldMap = fields.get(fieldId);
            return fieldMap ? readFieldRow(fieldMap, index + 1, stateSnapshot?.rows[index]) : null;
          })
          .filter((row): row is FieldRow => row != null)
          .map((row, index) => ({ ...row, order: index + 1 }))
      : []
    : (stateSnapshot?.rows ?? []);
  const hasIndexDoc =
    tableDoc.get('indexes') instanceof Y.Map || tableDoc.get('indexOrder') instanceof Y.Array;
  const indexes = readOrderedMap<IndexDefinition>(tableDoc, 'indexes', 'indexOrder');
  const hasForeignKeyDoc =
    tableDoc.get('foreignKeys') instanceof Y.Map ||
    tableDoc.get('foreignKeyOrder') instanceof Y.Array;
  const foreignKeys = readOrderedMap<ForeignKeyDefinition>(
    tableDoc,
    'foreignKeys',
    'foreignKeyOrder',
  );

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
    indexes: hasIndexDoc ? indexes : (state.indexes ?? []),
    authInput: typeof state.authInput === 'string' ? state.authInput : '',
    authObjects: Array.isArray(state.authObjects) ? state.authObjects : [],
    ...(state.citusShardingConfig ? { citusShardingConfig: state.citusShardingConfig } : {}),
    ...(state.mysqlPartitionConfig ? { mysqlPartitionConfig: state.mysqlPartitionConfig } : {}),
    ...(state.tableMiscConfig ? { tableMiscConfig: state.tableMiscConfig } : {}),
    ...(state.fieldTableViewConfig ? { fieldTableViewConfig: state.fieldTableViewConfig } : {}),
    ...(() => {
      const resolvedForeignKeys = hasForeignKeyDoc ? foreignKeys : state.foreignKeys;
      return resolvedForeignKeys && resolvedForeignKeys.length > 0
        ? { foreignKeys: resolvedForeignKeys }
        : {};
    })(),
  } as PersistedState;
};

const upsertTableRecord = (
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

const tableMetadata = (tableDoc: Y.Map<unknown>) => readJsonMap(ensureMap(tableDoc, 'metadata'));

export const upsertDraftInYDoc = (
  doc: Y.Doc,
  draftId: string,
  record: WorkspaceYDocDraftRecord,
  options?: ApplyPersistedStateOptions,
) => {
  const { drafts } = getWorkspaceRoot(doc);
  upsertTableRecord(
    drafts,
    draftId,
    record.state,
    {
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      folderId: record.folderId,
    },
    options,
  );
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

export const upsertSavedTableInYDoc = (
  doc: Y.Doc,
  record: SavedTableRecord,
  options?: ApplyPersistedStateOptions,
) => {
  const { savedTables } = getWorkspaceRoot(doc);
  upsertTableRecord(
    savedTables,
    record.normalizedName,
    record.state,
    {
      normalizedName: record.normalizedName,
      name: record.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      folderId: record.folderId,
    },
    options,
  );
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
  options?: ApplyPersistedStateOptions,
) => {
  const { savedDrafts } = getWorkspaceRoot(doc);
  upsertTableRecord(
    savedDrafts,
    normalizedName,
    record.state,
    {
      normalizedName,
      tableName: record.tableName,
      baseSignature: record.baseSignature,
      updatedAt: record.updatedAt,
    },
    options,
  );
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
  decodeWorkspaceSnapshot(doc, snapshot);
};

export const exportWorkspaceYDocToSnapshot = (doc: Y.Doc): WorkspaceSnapshot =>
  encodeWorkspaceSnapshot(doc);

const shouldApplySnapshotRecord = (
  localUpdatedAt: number | undefined,
  currentUpdatedAt: number | undefined,
) => currentUpdatedAt == null || (localUpdatedAt ?? 0) >= currentUpdatedAt;

export const mergeWorkspaceSnapshotIntoYDoc = (doc: Y.Doc, snapshot: WorkspaceSnapshot) => {
  const current = exportWorkspaceYDocToSnapshot(doc);
  const currentDrafts = new Map(current.drafts.map((draft) => [draft.draftId, draft]));
  const currentTables = new Map(current.savedTables.map((table) => [table.normalizedName, table]));
  const currentSavedDrafts = new Map(
    current.savedDrafts.map((draft) => [draft.normalizedName, draft]),
  );
  const currentFolders = new Set(current.folders.map((folder) => folder.id));
  const merged: WorkspaceSnapshot = {
    globalDraft: null,
    drafts: [],
    savedTables: [],
    savedDrafts: [],
    folders: [],
  };

  if (
    snapshot.globalDraft &&
    shouldApplySnapshotRecord(
      snapshot.globalDraft.updatedAt,
      currentDrafts.get(DEFAULT_DRAFT_ID)?.updatedAt,
    )
  ) {
    merged.globalDraft = snapshot.globalDraft;
  }

  for (const draft of snapshot.drafts) {
    if (shouldApplySnapshotRecord(draft.updatedAt, currentDrafts.get(draft.draftId)?.updatedAt)) {
      merged.drafts.push(draft);
    }
  }

  for (const table of snapshot.savedTables) {
    if (
      shouldApplySnapshotRecord(table.updatedAt, currentTables.get(table.normalizedName)?.updatedAt)
    ) {
      merged.savedTables.push(table);
    }
  }

  for (const draft of snapshot.savedDrafts) {
    if (
      shouldApplySnapshotRecord(
        draft.updatedAt,
        currentSavedDrafts.get(draft.normalizedName)?.updatedAt,
      )
    ) {
      merged.savedDrafts.push(draft);
    }
  }

  for (const folder of snapshot.folders) {
    if (!currentFolders.has(folder.id)) {
      merged.folders.push(folder);
    }
  }

  if (
    merged.globalDraft ||
    merged.drafts.length > 0 ||
    merged.savedTables.length > 0 ||
    merged.savedDrafts.length > 0 ||
    merged.folders.length > 0
  ) {
    importWorkspaceSnapshotToYDoc(doc, merged);
  }
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
          for (const key of event.changes.keys.keys()) {
            entityIds.add(key);
          }
        }
      }
      notify({ collection, entityIds, origin: transaction.origin });
    };
    root.observeDeep(handleChange);
    return { root, handleChange };
  });
  return () => {
    for (const { root, handleChange } of subscriptions) {
      root.unobserveDeep(handleChange);
    }
  };
};
