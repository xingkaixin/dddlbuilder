import * as Y from 'yjs';
import {
  type FieldRow,
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
  isRecord,
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
  decodeCitusFieldReference,
  decodeForeignKeyFieldReferences,
  decodeIndexFieldReferences,
  decodeMysqlPartitionFieldReferences,
  decodeTableMiscFieldReferences,
  encodeCitusFieldReference,
  encodeForeignKeyFieldReferences,
  encodeIndexFieldReferences,
  encodeMysqlPartitionFieldReferences,
  encodeTableMiscFieldReferences,
  type StoredForeignKeyDefinition,
  type StoredCitusShardingConfig,
  type StoredIndexDefinition,
  type StoredMysqlPartitionConfig,
  type StoredTableMiscConfig,
} from './workspaceFieldReferences';
import { decodeEnumMeta, decodePersistedState } from './persistedStateCodec';

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
  'standardId',
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

/* oxlint-disable anti-slop/no-runtime-typeof -- These helpers decode raw Y.Doc snapshots and legacy field values. */
const readStateSnapshot = (tableDoc: Y.Map<unknown>): SchemaDocumentState | null => {
  const snapshot = tableDoc.get('stateSnapshot');

  const state = decodePersistedState(snapshot);

  return state ? toSchemaDocumentState(state) : null;
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

const getFields = (tableDoc: Y.Map<unknown>) => readMap(tableDoc, 'fields');

const getFieldOrder = (tableDoc: Y.Map<unknown>) => readStringArray(tableDoc, 'fieldOrder');

/* oxlint-disable anti-slop/no-unknown-parameters -- These helpers decode raw scalar map values at the Y.Doc persistence boundary. */
const decodeStoredFieldIds = (value: unknown): Array<string | null> | undefined => {
  if (!Array.isArray(value)) return undefined;

  return value.map((item) => (item === null || typeof item === 'string' ? item : null));
};

const decodeStoredCitusConfig = (
  value: unknown,
  config: SchemaDocumentState['citusShardingConfig'],
): StoredCitusShardingConfig | undefined => {
  if (!config || !isRecord(value)) return undefined;

  const distributionColumnFieldId =
    typeof value.distributionColumnFieldId === 'string'
      ? value.distributionColumnFieldId
      : undefined;

  return {
    ...config,
    ...(distributionColumnFieldId ? { distributionColumnFieldId } : {}),
  };
};

const decodeStoredMysqlPartitionConfig = (
  value: unknown,
  config: SchemaDocumentState['mysqlPartitionConfig'],
): StoredMysqlPartitionConfig | undefined => {
  if (!config || !isRecord(value)) return undefined;

  const columnFieldIds = decodeStoredFieldIds(value.columnFieldIds);

  return {
    ...config,
    ...(columnFieldIds ? { columnFieldIds } : {}),
  };
};

const decodeStoredTableMiscConfig = (
  value: unknown,
  config: SchemaDocumentState['tableMiscConfig'],
): StoredTableMiscConfig | undefined => {
  if (!config || !isRecord(value)) return undefined;

  const partitions = isRecord(value.partitions) ? value.partitions : undefined;

  const clustering =
    partitions && isRecord(partitions.clustering) ? partitions.clustering : undefined;
  const columnFieldIds = decodeStoredFieldIds(clustering?.columnFieldIds);

  if (!columnFieldIds || !config.partitions?.clustering) return config;

  return {
    ...config,
    partitions: {
      ...config.partitions,
      clustering: { ...config.partitions.clustering, columnFieldIds },
    },
  };
};

/* oxlint-enable anti-slop/no-unknown-parameters */

// fieldId 即行身份：Y.Map 的键本身就是稳定 id，旧文档的 `field_N_hash` 键也照此沿用。
const readFieldRow = (
  fieldId: string,
  fieldMap: Y.Map<unknown>,
  fallbackRow?: FieldRow,
): FieldRow => {
  const row = readJsonMap(fieldMap);

  const candidates = (key: keyof FieldRow) =>
    row[key] === null ? [] : [row[key], fallbackRow?.[key]];

  const text = (key: keyof FieldRow) => candidates(key).find((value) => typeof value === 'string');

  // nullable 迁移前存中文字符串、迁移后存布尔，两种都算合法值，其余类型继续回落
  const nullable = candidates('nullable').find(
    (value) => typeof value === 'boolean' || typeof value === 'string',
  );
  const defaultKind = text('defaultKind');
  const defaultValue = text('defaultValue');
  const onUpdate = text('onUpdate');

  const enumMeta = candidates('enumMeta').find((value): value is unknown[] => Array.isArray(value));

  return {
    id: fieldId,
    ...(text('standardId') ? { standardId: text('standardId') } : {}),
    fieldName: text('fieldName') ?? '',
    fieldType: text('fieldType') ?? '',
    fieldComment: text('fieldComment') ?? '',
    nullable: normalizeFieldNullable(nullable),
    ...(defaultKind === undefined ? {} : { defaultKind: normalizeFieldDefaultKind(defaultKind) }),
    ...(defaultValue === undefined ? {} : { defaultValue }),
    ...(onUpdate === undefined ? {} : { onUpdate: normalizeFieldOnUpdate(onUpdate) }),
    ...(enumMeta === undefined ? {} : { enumMeta: decodeEnumMeta(enumMeta) }),
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
  const previousForeignKeys = hasForeignKeyDoc(tableDoc)
    ? readOrderedMap<StoredForeignKeyDefinition>(tableDoc, 'foreignKeys', 'foreignKeyOrder')
    : (previousSnapshot?.foreignKeys ?? []);
  const encodedIndexes = encodeIndexFieldReferences(documentState.indexes ?? [], nextRows);

  const encodedForeignKeys = encodeForeignKeyFieldReferences(
    documentState.foreignKeys ?? [],
    nextRows,
  );
  const storedDocumentState = {
    ...documentState,
    citusShardingConfig: encodeCitusFieldReference(documentState.citusShardingConfig, nextRows),
    mysqlPartitionConfig: encodeMysqlPartitionFieldReferences(
      documentState.mysqlPartitionConfig,
      nextRows,
    ),
    tableMiscConfig: encodeTableMiscFieldReferences(documentState.tableMiscConfig, nextRows),
  };
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
    storedDocumentState,
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
    stableStringify(previousForeignKeys) !== stableStringify(encodedForeignKeys)
  ) {
    writeOrderedMap(tableDoc, 'foreignKeys', 'foreignKeyOrder', encodedForeignKeys);
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

const readTableRows = (tableDoc: Y.Map<unknown>, stateSnapshot: SchemaDocumentState | null) => {
  const snapshotRowsById = new Map((stateSnapshot?.rows ?? []).map((row) => [row.id, row]));
  const fields = getFields(tableDoc);

  if (!hasFieldDoc(tableDoc)) return stateSnapshot?.rows ?? [];
  if (!fields) return [];

  const rows: FieldRow[] = [];

  for (const fieldId of getFieldOrder(tableDoc)) {
    const fieldMap = fields.get(fieldId);

    if (fieldMap instanceof Y.Map) {
      rows.push(readFieldRow(fieldId, fieldMap, snapshotRowsById.get(fieldId)));
    }
  }

  return rows;
};

export const tableDocToSchemaSummary = (tableDoc: Y.Map<unknown>) => {
  const snapshot = readStateSnapshot(tableDoc);
  const scalarDbType = readMap(tableDoc, 'scalar')?.get('dbType');
  const dbType = scalarDbType === undefined ? snapshot?.dbType : scalarDbType;

  return {
    dbType: typeof dbType === 'string' ? dbType : 'mysql',
    fieldCount: readTableRows(tableDoc, snapshot).filter(
      (row) => typeof row.fieldName === 'string' && row.fieldName.trim(),
    ).length,
  };
};

/* oxlint-enable anti-slop/no-runtime-typeof */

export const tableDocToSchemaDocumentState = (tableDoc: Y.Map<unknown>): SchemaDocumentState => {
  const stateSnapshot = readStateSnapshot(tableDoc);
  const scalar = readMap(tableDoc, 'scalar');

  const rawState = {
    ...stateSnapshot,
    ...Object.fromEntries(
      TABLE_SCALAR_KEYS.flatMap((key) => {
        const value = scalar?.get(key);

        return value === undefined ? [] : [[key, value]];
      }),
    ),
  };
  const state = decodePersistedState(rawState);
  const rows = readTableRows(tableDoc, stateSnapshot);

  const indexes = decodeIndexFieldReferences(
    hasIndexDoc(tableDoc)
      ? readOrderedMap<StoredIndexDefinition>(tableDoc, 'indexes', 'indexOrder')
      : (state?.indexes ?? []),
    rows,
  );
  const foreignKeys = decodeForeignKeyFieldReferences(
    hasForeignKeyDoc(tableDoc)
      ? readOrderedMap<StoredForeignKeyDefinition>(tableDoc, 'foreignKeys', 'foreignKeyOrder')
      : (state?.foreignKeys ?? []),
    rows,
  );
  const citusShardingConfig = decodeCitusFieldReference(
    decodeStoredCitusConfig(rawState.citusShardingConfig, state?.citusShardingConfig),
    rows,
  );

  const mysqlPartitionConfig = decodeMysqlPartitionFieldReferences(
    decodeStoredMysqlPartitionConfig(rawState.mysqlPartitionConfig, state?.mysqlPartitionConfig),
    rows,
  );
  const tableMiscConfig = decodeTableMiscFieldReferences(
    decodeStoredTableMiscConfig(rawState.tableMiscConfig, state?.tableMiscConfig),
    rows,
  );

  return normalizeSchemaDocumentState({
    ...state,
    rows,
    indexes,
    foreignKeys,
    citusShardingConfig,
    mysqlPartitionConfig,
    tableMiscConfig,
  });
};

export const materializeTableDoc = (tableDoc: Y.Map<unknown>) => {
  if (hasFineGrainedTableDoc(tableDoc)) {
    const state = tableDocToSchemaDocumentState(tableDoc);
    const indexes = readOrderedMap<StoredIndexDefinition>(tableDoc, 'indexes', 'indexOrder');

    const foreignKeys = readOrderedMap<StoredForeignKeyDefinition>(
      tableDoc,
      'foreignKeys',
      'foreignKeyOrder',
    );
    const scalar = readMap(tableDoc, 'scalar');
    const encodedIndexes = encodeIndexFieldReferences(state.indexes, state.rows);
    const encodedForeignKeys = encodeForeignKeyFieldReferences(state.foreignKeys ?? [], state.rows);
    const encodedCitus = encodeCitusFieldReference(state.citusShardingConfig, state.rows);

    const encodedMysql = encodeMysqlPartitionFieldReferences(
      state.mysqlPartitionConfig,
      state.rows,
    );
    const encodedMisc = encodeTableMiscFieldReferences(state.tableMiscConfig, state.rows);
    let materialized = false;

    if (stableStringify(indexes) !== stableStringify(encodedIndexes)) {
      writeOrderedMap(tableDoc, 'indexes', 'indexOrder', encodedIndexes);
      materialized = true;
    }

    if (stableStringify(foreignKeys) !== stableStringify(encodedForeignKeys)) {
      writeOrderedMap(tableDoc, 'foreignKeys', 'foreignKeyOrder', encodedForeignKeys);
      materialized = true;
    }

    const scalarReferences = {
      citusShardingConfig: encodedCitus,
      mysqlPartitionConfig: encodedMysql,
      tableMiscConfig: encodedMisc,
    };

    for (const [key, value] of Object.entries(scalarReferences)) {
      if (stableStringify(scalar?.get(key)) === stableStringify(value)) continue;
      writeJsonMapPatch(ensureMap(tableDoc, 'scalar'), { [key]: value });
      materialized = true;
    }

    return materialized;
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
