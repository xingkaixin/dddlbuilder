import * as Y from 'yjs';
import {
  type FieldRow,
  type ForeignKeyDefinition,
  type SchemaDocumentState,
  ensureFieldId,
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
  normalizePersistedRows,
  toSchemaDocumentState,
} from '@ddlbuilder/shared-types';
import {
  assertUniqueIds,
  ensureArray,
  ensureMap,
  hasMapOrArray,
  type JsonRecord,
  readJsonMap,
  readMap,
  readOrderedMap,
  readStringArray,
  syncStringArray,
  writeJsonMapPatch,
  writeOrderedMap,
} from './yMapJson';
import { stableStringify } from './stableStringify';
import {
  decodeIndexFieldReferences,
  encodeIndexFieldReferences,
  type StoredIndexDefinition,
} from './workspaceIndexReferences';

const TABLE_SCALAR_KEYS = [
  'objectType',
  'schemaName',
  'tableName',
  'tableComment',
  'dbType',
  'viewDefinition',
  'viewCreateOrReplace',
  'authInput',
  'authObjects',
  'citusShardingConfig',
  'mysqlPartitionConfig',
  'tableMiscConfig',
] as const;

const EDITOR_SESSION_KEYS = [
  'sqlFormatMode',
  'addCount',
  'indexInput',
  'currentIndexFields',
  'fieldTableViewConfig',
] as const;

// order 不入库：顺序由 fieldOrder 数组表达，再存一份必然与之分叉。
const FIELD_KEYS = [
  'fieldName',
  'fieldType',
  'fieldComment',
  'nullable',
  'defaultKind',
  'defaultValue',
  'onUpdate',
  'enumMeta',
] as const;

export type ApplySchemaDocumentStateOptions = {
  compactSnapshotBase?: boolean;
  forceFineGrained?: boolean;
};

const writeStateSnapshot = (tableDoc: Y.Map<unknown>, state: SchemaDocumentState) => {
  const nextSnapshot = JSON.parse(JSON.stringify(state));
  if (stableStringify(tableDoc.get('stateSnapshot')) !== stableStringify(nextSnapshot)) {
    tableDoc.set('stateSnapshot', nextSnapshot);
  }
};

// 增量写模型里「键缺失」只能表达「无变化」，无法表达「已删除」；
// 一旦相对基线有键消失，冻结的 stateSnapshot 就会让旧值复活，必须重写全量基线。
const hasRemovedKey = <T>(previous: T | undefined, next: T, keys: readonly (keyof T)[]) =>
  previous != null && keys.some((key) => previous[key] !== undefined && next[key] === undefined);

const hasRemovedStateKey = (previous: SchemaDocumentState, next: SchemaDocumentState) => {
  if (hasRemovedKey(previous, next, TABLE_SCALAR_KEYS)) return true;
  const previousRows = new Map((previous.rows ?? []).map((row) => [row.id, row]));
  return (next.rows ?? []).some((row) => hasRemovedKey(previousRows.get(row.id), row, FIELD_KEYS));
};

const readStateSnapshot = (tableDoc: Y.Map<unknown>): SchemaDocumentState | null => {
  const snapshot = tableDoc.get('stateSnapshot');
  if (!snapshot || typeof snapshot !== 'object') return null;
  const state = snapshot as Partial<SchemaDocumentState>;
  if (!Array.isArray(state.rows)) return null;
  return toSchemaDocumentState(state as SchemaDocumentState);
};

const hasEditorSessionState = (tableDoc: Y.Map<unknown>) => {
  const snapshot = tableDoc.get('stateSnapshot');
  const scalar = readMap(tableDoc, 'scalar');
  return EDITOR_SESSION_KEYS.some(
    (key) =>
      (snapshot != null && typeof snapshot === 'object' && key in snapshot) || scalar?.has(key),
  );
};

const hasFieldDoc = (tableDoc: Y.Map<unknown>) => hasMapOrArray(tableDoc, 'fields', 'fieldOrder');
const hasIndexDoc = (tableDoc: Y.Map<unknown>) => hasMapOrArray(tableDoc, 'indexes', 'indexOrder');
const hasForeignKeyDoc = (tableDoc: Y.Map<unknown>) =>
  hasMapOrArray(tableDoc, 'foreignKeys', 'foreignKeyOrder');

const hasFineGrainedTableDoc = (tableDoc: Y.Map<unknown>) =>
  tableDoc.get('scalar') instanceof Y.Map ||
  hasFieldDoc(tableDoc) ||
  hasIndexDoc(tableDoc) ||
  hasForeignKeyDoc(tableDoc);

const getFields = (tableDoc: Y.Map<unknown>) =>
  readMap(tableDoc, 'fields') as Y.Map<Y.Map<unknown>> | null;

const getFieldOrder = (tableDoc: Y.Map<unknown>) => readStringArray(tableDoc, 'fieldOrder');

// fieldId 即行身份：Y.Map 的键本身就是稳定 id，旧文档的 `field_N_hash` 键也照此沿用。
const readFieldRow = (
  fieldId: string,
  fieldMap: Y.Map<unknown>,
  fallbackRow?: FieldRow,
): FieldRow => {
  const row = readJsonMap(fieldMap);
  const fallback = (fallbackRow ?? {}) as unknown as JsonRecord;
  const candidates = (key: string) => (row[key] === null ? [] : [row[key], fallback[key]]);
  const text = (key: string) => candidates(key).find((value) => typeof value === 'string');
  // nullable 迁移前存中文字符串、迁移后存布尔，两种都算合法值，其余类型继续回落
  const nullable = candidates('nullable').find(
    (value) => typeof value === 'boolean' || typeof value === 'string',
  );
  const defaultKind = text('defaultKind');
  const defaultValue = text('defaultValue');
  const onUpdate = text('onUpdate');
  const enumMeta = candidates('enumMeta').find((value) => Array.isArray(value));

  return {
    id: fieldId,
    fieldName: text('fieldName') ?? '',
    fieldType: text('fieldType') ?? '',
    fieldComment: text('fieldComment') ?? '',
    nullable: normalizeFieldNullable(nullable),
    ...(defaultKind === undefined ? {} : { defaultKind: normalizeFieldDefaultKind(defaultKind) }),
    ...(defaultValue === undefined ? {} : { defaultValue }),
    ...(onUpdate === undefined ? {} : { onUpdate: normalizeFieldOnUpdate(onUpdate) }),
    ...(enumMeta === undefined ? {} : { enumMeta: enumMeta as FieldRow['enumMeta'] }),
  };
};

// 写入基线只能是文档自身的现值：map 里有的键以 map 为准，缺失的键解码时会回落到 stateSnapshot。
// 拿冻结快照当基线会与解码基线分叉，把「值已改回快照内容」误判成无需写入。
const buildPatch = <T>(
  map: Y.Map<unknown> | null | undefined,
  keys: readonly (keyof T & string)[],
  next: T,
  snapshot: T | null | undefined,
  writeAllKeys: boolean,
): JsonRecord => {
  const values: JsonRecord = {};
  for (const key of keys) {
    const current = map?.has(key) ? map.get(key) : snapshot?.[key];
    if (!writeAllKeys && stableStringify(current) === stableStringify(next[key])) continue;
    values[key] = next[key];
  }
  return values;
};

export const applySchemaDocumentStateToTableDoc = (
  tableDoc: Y.Map<unknown>,
  state: SchemaDocumentState,
  options: ApplySchemaDocumentStateOptions = {},
) => {
  const documentState = toSchemaDocumentState(state);
  const nextRows = documentState.rows ?? [];
  const fieldIds = nextRows.map((row, index) => ensureFieldId(row, index));
  assertUniqueIds(fieldIds, 'fields');
  assertUniqueIds(
    (documentState.indexes ?? []).map((index) => index.id),
    'indexes',
  );
  assertUniqueIds(
    (documentState.foreignKeys ?? []).map((foreignKey) => foreignKey.id),
    'foreignKeys',
  );
  const previousSnapshot = readStateSnapshot(tableDoc);
  const previousIndexes = hasIndexDoc(tableDoc)
    ? readOrderedMap<StoredIndexDefinition>(tableDoc, 'indexes', 'indexOrder')
    : (previousSnapshot?.indexes ?? []);
  const encodedIndexes = encodeIndexFieldReferences(documentState.indexes ?? [], nextRows);
  const containsEditorSessionState = hasEditorSessionState(tableDoc);
  if (
    options.compactSnapshotBase !== true ||
    previousSnapshot == null ||
    containsEditorSessionState ||
    hasRemovedStateKey(previousSnapshot, documentState)
  ) {
    writeStateSnapshot(tableDoc, documentState);
  }
  const writeAllKeys = options.forceFineGrained === true || previousSnapshot == null;

  const scalarValues = buildPatch(
    readMap(tableDoc, 'scalar'),
    TABLE_SCALAR_KEYS,
    documentState,
    previousSnapshot,
    writeAllKeys,
  );
  if (Object.keys(scalarValues).length > 0) {
    writeJsonMapPatch(ensureMap(tableDoc, 'scalar'), scalarValues);
  }
  if (containsEditorSessionState) {
    const scalar = readMap(tableDoc, 'scalar');
    EDITOR_SESSION_KEYS.forEach((key) => scalar?.delete(key));
  }

  const snapshotRows = previousSnapshot?.rows ?? [];
  const snapshotRowsById = new Map(snapshotRows.map((row) => [row.id, row]));
  if (
    writeAllKeys ||
    hasFieldDoc(tableDoc) ||
    stableStringify(snapshotRows) !== stableStringify(nextRows)
  ) {
    const existingFields = getFields(tableDoc);
    const fieldPatches = nextRows.map((row, index) => {
      const field = existingFields?.get(fieldIds[index]);
      const patch = buildPatch(
        field,
        FIELD_KEYS,
        row,
        snapshotRowsById.get(fieldIds[index]),
        writeAllKeys || FIELD_KEYS.some((key) => !field?.has(key)),
      );
      // null 是显式清除，缺键仅供旧稀疏文档按字段身份读取快照。
      return Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value ?? null]));
    });
    const fields = ensureMap(tableDoc, 'fields');
    const activeFieldIds = new Set(fieldIds);
    for (const fieldId of Array.from(fields.keys())) {
      if (!activeFieldIds.has(fieldId)) {
        fields.delete(fieldId);
      }
    }
    fieldIds.forEach((fieldId, index) => {
      writeJsonMapPatch(ensureMap(fields, fieldId), fieldPatches[index]);
    });
    syncStringArray(ensureArray(tableDoc, 'fieldOrder'), fieldIds);
  }

  if (
    writeAllKeys ||
    hasIndexDoc(tableDoc) ||
    stableStringify(previousIndexes) !== stableStringify(encodedIndexes)
  ) {
    writeOrderedMap(tableDoc, 'indexes', 'indexOrder', encodedIndexes);
  }
  if (
    writeAllKeys ||
    hasForeignKeyDoc(tableDoc) ||
    stableStringify(previousSnapshot?.foreignKeys ?? []) !==
      stableStringify(documentState.foreignKeys ?? [])
  ) {
    writeOrderedMap(tableDoc, 'foreignKeys', 'foreignKeyOrder', documentState.foreignKeys ?? []);
  }
};

export const normalizeSchemaDocumentState = (
  state: Partial<SchemaDocumentState>,
): SchemaDocumentState => {
  return {
    objectType: state.objectType === 'view' ? 'view' : 'table',
    schemaName: typeof state.schemaName === 'string' ? state.schemaName : '',
    tableName: typeof state.tableName === 'string' ? state.tableName : '',
    tableComment: typeof state.tableComment === 'string' ? state.tableComment : '',
    dbType: typeof state.dbType === 'string' ? state.dbType : 'mysql',
    viewDefinition: typeof state.viewDefinition === 'string' ? state.viewDefinition : '',
    viewCreateOrReplace: state.viewCreateOrReplace !== false,
    rows: normalizePersistedRows({ rows: state.rows ?? [] }).rows.map((row) => ({
      ...row,
      fieldName: typeof row.fieldName === 'string' ? row.fieldName : '',
      fieldType: typeof row.fieldType === 'string' ? row.fieldType : '',
      fieldComment: typeof row.fieldComment === 'string' ? row.fieldComment : '',
    })),
    indexes: state.indexes ?? [],
    authInput: typeof state.authInput === 'string' ? state.authInput : '',
    authObjects: Array.isArray(state.authObjects) ? state.authObjects : [],
    ...(state.citusShardingConfig ? { citusShardingConfig: state.citusShardingConfig } : {}),
    ...(state.mysqlPartitionConfig ? { mysqlPartitionConfig: state.mysqlPartitionConfig } : {}),
    ...(state.tableMiscConfig ? { tableMiscConfig: state.tableMiscConfig } : {}),
    ...(state.foreignKeys?.length ? { foreignKeys: state.foreignKeys } : {}),
  };
};

export const tableDocToSchemaDocumentState = (tableDoc: Y.Map<unknown>): SchemaDocumentState => {
  const stateSnapshot = readStateSnapshot(tableDoc);
  const snapshotRowsById = new Map((stateSnapshot?.rows ?? []).map((row) => [row.id, row]));
  const state = {
    ...stateSnapshot,
    ...Object.fromEntries(
      TABLE_SCALAR_KEYS.map((key) => [key, readMap(tableDoc, 'scalar')?.get(key)]).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  } as Partial<SchemaDocumentState>;
  const fields = getFields(tableDoc);
  const rows = !hasFieldDoc(tableDoc)
    ? (stateSnapshot?.rows ?? [])
    : fields
      ? getFieldOrder(tableDoc)
          .map((fieldId) => {
            const fieldMap = fields.get(fieldId);
            return fieldMap ? readFieldRow(fieldId, fieldMap, snapshotRowsById.get(fieldId)) : null;
          })
          .filter((row): row is FieldRow => row != null)
      : [];
  const indexes = decodeIndexFieldReferences(
    hasIndexDoc(tableDoc)
      ? readOrderedMap<StoredIndexDefinition>(tableDoc, 'indexes', 'indexOrder')
      : (state.indexes ?? []),
    rows,
  );
  const foreignKeys = hasForeignKeyDoc(tableDoc)
    ? readOrderedMap<ForeignKeyDefinition>(tableDoc, 'foreignKeys', 'foreignKeyOrder')
    : state.foreignKeys;

  return normalizeSchemaDocumentState({ ...state, rows, indexes, foreignKeys });
};

export const materializeTableDoc = (tableDoc: Y.Map<unknown>) => {
  if (hasFineGrainedTableDoc(tableDoc)) {
    const state = tableDocToSchemaDocumentState(tableDoc);
    const indexes = hasIndexDoc(tableDoc)
      ? readOrderedMap<StoredIndexDefinition>(tableDoc, 'indexes', 'indexOrder')
      : state.indexes;
    const encoded = encodeIndexFieldReferences(state.indexes, state.rows);
    if (stableStringify(indexes) === stableStringify(encoded)) return false;
    writeOrderedMap(tableDoc, 'indexes', 'indexOrder', encoded);
    return true;
  }
  const stateSnapshot = readStateSnapshot(tableDoc);
  if (!stateSnapshot) return false;
  applySchemaDocumentStateToTableDoc(tableDoc, tableDocToSchemaDocumentState(tableDoc), {
    forceFineGrained: true,
  });
  return true;
};

export const tableMetadata = (tableDoc: Y.Map<unknown>) =>
  readJsonMap(readMap(tableDoc, 'metadata'));
