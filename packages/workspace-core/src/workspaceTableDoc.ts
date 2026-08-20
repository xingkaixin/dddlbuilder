import * as Y from 'yjs';
import type {
  FieldRow,
  ForeignKeyDefinition,
  IndexDefinition,
  PersistedState,
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

type FieldTextKey =
  | 'fieldName'
  | 'fieldType'
  | 'fieldComment'
  | 'nullable'
  | 'defaultKind'
  | 'defaultValue'
  | 'onUpdate';

const readFieldRow = (
  fieldMap: Y.Map<unknown>,
  fallbackOrder: number,
  fallbackRow?: FieldRow,
): FieldRow => {
  const row = readJsonMap(fieldMap) as Partial<FieldRow>;
  const fallback: Partial<FieldRow> = fallbackRow ?? {};
  const text = (key: FieldTextKey) =>
    [row[key], fallback[key]].find((value) => typeof value === 'string');
  const order = [row.order, fallback.order].find((value) => typeof value === 'number');
  const defaultKind = text('defaultKind');
  const defaultValue = text('defaultValue');
  const onUpdate = text('onUpdate');
  const enumMeta = [row.enumMeta, fallback.enumMeta].find((value) => Array.isArray(value));

  return {
    order: order ?? fallbackOrder,
    fieldName: text('fieldName') ?? '',
    fieldType: text('fieldType') ?? '',
    fieldComment: text('fieldComment') ?? '',
    nullable: text('nullable') ?? '是',
    ...(defaultKind === undefined ? {} : { defaultKind }),
    ...(defaultValue === undefined ? {} : { defaultValue }),
    ...(onUpdate === undefined ? {} : { onUpdate }),
    ...(enumMeta === undefined ? {} : { enumMeta }),
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

const chooseFieldIds = (tableDoc: Y.Map<unknown>, rows: FieldRow[], baseRows: FieldRow[]) => {
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
      readFieldRow(fieldMap, index + 1, baseRows[index]),
      fieldId,
    );
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
  const fieldIds = chooseFieldIds(tableDoc, nextRows, snapshotRows);
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
  const stateSnapshot = readStateSnapshot(tableDoc);
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
            return fieldMap ? readFieldRow(fieldMap, index + 1, stateSnapshot?.rows[index]) : null;
          })
          .filter((row): row is FieldRow => row != null)
          .map((row, index) => ({ ...row, order: index + 1 }))
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
