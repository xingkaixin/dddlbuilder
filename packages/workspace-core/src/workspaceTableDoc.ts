import * as Y from 'yjs';
import {
  type FieldRow,
  type ForeignKeyDefinition,
  type IndexDefinition,
  type PersistedState,
  ensureFieldId,
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
  normalizePersistedRows,
} from '@ddlbuilder/shared-types';
import {
  ensureArray,
  ensureMap,
  hasMapOrArray,
  type JsonRecord,
  readJsonMap,
  readMap,
  readOrderedMap,
  readStringArray,
  stableStringify,
  syncStringArray,
  writeJsonMapPatch,
  writeOrderedMap,
} from './yMapJson';

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

export type ApplyPersistedStateOptions = {
  compactSnapshotBase?: boolean;
  forceFineGrained?: boolean;
};

const writeStateSnapshot = (tableDoc: Y.Map<unknown>, state: PersistedState) => {
  const nextSnapshot = JSON.parse(JSON.stringify(state));
  if (stableStringify(tableDoc.get('stateSnapshot')) !== stableStringify(nextSnapshot)) {
    tableDoc.set('stateSnapshot', nextSnapshot);
  }
};

// 增量写模型里「键缺失」只能表达「无变化」，无法表达「已删除」；
// 一旦相对基线有键消失，冻结的 stateSnapshot 就会让旧值复活，必须重写全量基线。
const hasRemovedKey = <T>(previous: T | undefined, next: T, keys: readonly (keyof T)[]) =>
  previous != null && keys.some((key) => previous[key] !== undefined && next[key] === undefined);

const hasRemovedStateKey = (previous: PersistedState, next: PersistedState) => {
  if (hasRemovedKey(previous, next, TABLE_SCALAR_KEYS)) return true;
  const previousRows = previous.rows ?? [];
  return (next.rows ?? []).some((row, index) =>
    hasRemovedKey(previousRows[index], row, FIELD_KEYS),
  );
};

const readStateSnapshot = (tableDoc: Y.Map<unknown>): PersistedState | null => {
  const snapshot = tableDoc.get('stateSnapshot');
  if (!snapshot || typeof snapshot !== 'object') return null;
  const state = snapshot as Partial<PersistedState>;
  if (!Array.isArray(state.rows)) return null;
  return state as PersistedState;
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
  const row: JsonRecord = readJsonMap(fieldMap);
  const fallback: JsonRecord = (fallbackRow ?? {}) as unknown as JsonRecord;
  const text = (key: string) =>
    [row[key], fallback[key]].find((value) => typeof value === 'string');
  // nullable 迁移前存中文字符串、迁移后存布尔，两种都算合法值，其余类型继续回落
  const nullable = [row.nullable, fallback.nullable].find(
    (value) => typeof value === 'boolean' || typeof value === 'string',
  );
  const defaultKind = text('defaultKind');
  const defaultValue = text('defaultValue');
  const onUpdate = text('onUpdate');
  const enumMeta = [row.enumMeta, fallback.enumMeta].find((value) => Array.isArray(value));

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

export const applyPersistedStateToTableDoc = (
  tableDoc: Y.Map<unknown>,
  state: PersistedState,
  options: ApplyPersistedStateOptions = {},
) => {
  const previousSnapshot = readStateSnapshot(tableDoc);
  if (
    options.compactSnapshotBase !== true ||
    previousSnapshot == null ||
    hasRemovedStateKey(previousSnapshot, state)
  ) {
    writeStateSnapshot(tableDoc, state);
  }
  const writeAllKeys = options.forceFineGrained === true || previousSnapshot == null;

  const scalarValues = buildPatch(
    readMap(tableDoc, 'scalar'),
    TABLE_SCALAR_KEYS,
    state,
    previousSnapshot,
    writeAllKeys,
  );
  if (Object.keys(scalarValues).length > 0) {
    writeJsonMapPatch(ensureMap(tableDoc, 'scalar'), scalarValues);
  }

  const snapshotRows = previousSnapshot?.rows ?? [];
  const nextRows = state.rows ?? [];
  const fieldIds = nextRows.map((row, index) => ensureFieldId(row, index));
  if (
    writeAllKeys ||
    hasFieldDoc(tableDoc) ||
    stableStringify(snapshotRows) !== stableStringify(nextRows)
  ) {
    const existingFields = getFields(tableDoc);
    const fieldPatches = nextRows.map((row, index) =>
      buildPatch(
        existingFields?.get(fieldIds[index]),
        FIELD_KEYS,
        row,
        snapshotRows[index],
        writeAllKeys,
      ),
    );
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
    stableStringify(previousSnapshot?.indexes ?? []) !== stableStringify(state.indexes ?? [])
  ) {
    writeOrderedMap(tableDoc, 'indexes', 'indexOrder', state.indexes ?? []);
  }
  if (
    writeAllKeys ||
    hasForeignKeyDoc(tableDoc) ||
    stableStringify(previousSnapshot?.foreignKeys ?? []) !==
      stableStringify(state.foreignKeys ?? [])
  ) {
    writeOrderedMap(tableDoc, 'foreignKeys', 'foreignKeyOrder', state.foreignKeys ?? []);
  }
};

export const tableDocToPersistedState = (tableDoc: Y.Map<unknown>): PersistedState => {
  const rawSnapshot = readStateSnapshot(tableDoc);
  // 快照可能是历史格式，且下面有绕过 readFieldRow 直接取快照 rows 的分支，先归一化。
  const stateSnapshot = rawSnapshot && normalizePersistedRows(rawSnapshot);
  if (!hasFineGrainedTableDoc(tableDoc) && stateSnapshot) return stateSnapshot;

  const state = {
    ...stateSnapshot,
    ...readJsonMap(readMap(tableDoc, 'scalar')),
  } as Partial<PersistedState>;
  const fields = getFields(tableDoc);
  const rows = !hasFieldDoc(tableDoc)
    ? (stateSnapshot?.rows ?? [])
    : fields
      ? getFieldOrder(tableDoc)
          .map((fieldId, index) => {
            const fieldMap = fields.get(fieldId);
            return fieldMap ? readFieldRow(fieldId, fieldMap, stateSnapshot?.rows[index]) : null;
          })
          .filter((row): row is FieldRow => row != null)
      : [];
  const indexes = hasIndexDoc(tableDoc)
    ? readOrderedMap<IndexDefinition>(tableDoc, 'indexes', 'indexOrder')
    : (state.indexes ?? []);
  const foreignKeys = hasForeignKeyDoc(tableDoc)
    ? readOrderedMap<ForeignKeyDefinition>(tableDoc, 'foreignKeys', 'foreignKeyOrder')
    : state.foreignKeys;

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
    indexes,
    authInput: typeof state.authInput === 'string' ? state.authInput : '',
    authObjects: Array.isArray(state.authObjects) ? state.authObjects : [],
    ...(state.citusShardingConfig ? { citusShardingConfig: state.citusShardingConfig } : {}),
    ...(state.mysqlPartitionConfig ? { mysqlPartitionConfig: state.mysqlPartitionConfig } : {}),
    ...(state.tableMiscConfig ? { tableMiscConfig: state.tableMiscConfig } : {}),
    ...(state.fieldTableViewConfig ? { fieldTableViewConfig: state.fieldTableViewConfig } : {}),
    ...(foreignKeys && foreignKeys.length > 0 ? { foreignKeys } : {}),
  } as PersistedState;
};

export const materializeTableDoc = (tableDoc: Y.Map<unknown>) => {
  if (hasFineGrainedTableDoc(tableDoc)) return false;
  const stateSnapshot = readStateSnapshot(tableDoc);
  if (!stateSnapshot) return false;
  applyPersistedStateToTableDoc(tableDoc, stateSnapshot, { forceFineGrained: true });
  return true;
};

export const tableMetadata = (tableDoc: Y.Map<unknown>) =>
  readJsonMap(readMap(tableDoc, 'metadata'));
