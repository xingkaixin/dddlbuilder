import {
  isDatabaseType,
  ensureFieldId,
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
  type CitusShardingConfig,
  type FieldRow,
  type FieldTableViewConfig,
  type ForeignKeyAction,
  type ForeignKeyDefinition,
  type HiveClusteringConfig,
  type HivePartitionConfig,
  type IndexDefinition,
  type IndexField,
  type MysqlPartitionConfig,
  type MysqlPartitionType,
  type PersistedState,
  type SchemaDocumentState,
  type TableMiscConfig,
  toSchemaDocumentState,
} from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import { normalizeWorkspaceSnapshot } from './workspaceSnapshotNormalization';

export type PersistedStateDecodeMode = 'compatible' | 'external';

const MYSQL_PARTITION_TYPES = new Set<MysqlPartitionType>([
  'RANGE',
  'RANGE COLUMNS',
  'LIST',
  'LIST COLUMNS',
  'HASH',
  'KEY',
]);
const FOREIGN_KEY_ACTIONS = new Set<ForeignKeyAction>([
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
  'RESTRICT',
  'NO ACTION',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const toFiniteNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const toOptionalText = (value: unknown) => (typeof value === 'string' ? value : undefined);
const toOptionalFiniteNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const toStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const splitQualifiedTableName = (raw: string) => {
  const parts = raw
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length <= 1
    ? { schema: '', table: parts[0] ?? raw.trim() }
    : { schema: parts.slice(0, -1).join('.'), table: parts.at(-1) ?? '' };
};

const decodeIndexFields = (value: unknown): IndexField[] =>
  (Array.isArray(value) ? value : []).flatMap((item) => {
    if (!isRecord(item)) return [];
    const name = toText(item.name);
    return name ? [{ name, direction: item.direction === 'DESC' ? 'DESC' : 'ASC' }] : [];
  });

const decodeIndexes = (value: unknown): IndexDefinition[] =>
  (Array.isArray(value) ? value : []).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const name = toText(item.name);
    if (!name) return [];
    return [
      {
        id: toText(item.id, `legacy-index-${index}`),
        name,
        fields: decodeIndexFields(item.fields),
        unique: item.unique === true,
        isPrimary: item.isPrimary === true,
      },
    ];
  });

const decodeRows = (value: unknown): FieldRow[] =>
  (Array.isArray(value) ? value : []).map((item, index) => {
    const row = isRecord(item) ? item : {};
    return {
      id: ensureFieldId(row as Partial<FieldRow>, index),
      fieldName: toText(row.fieldName),
      fieldType: toText(row.fieldType),
      fieldComment: toText(row.fieldComment),
      nullable: normalizeFieldNullable(row.nullable),
      defaultKind: normalizeFieldDefaultKind(row.defaultKind),
      defaultValue: toText(row.defaultValue),
      onUpdate: normalizeFieldOnUpdate(row.onUpdate),
      ...(Array.isArray(row.enumMeta) ? { enumMeta: row.enumMeta as FieldRow['enumMeta'] } : {}),
    };
  });

const decodeForeignKeys = (value: unknown): ForeignKeyDefinition[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const name = toText(item.name);
    const refTable = toText(item.refTable);
    if (!name || !refTable) return [];
    const onDelete = FOREIGN_KEY_ACTIONS.has(item.onDelete as ForeignKeyAction)
      ? (item.onDelete as ForeignKeyAction)
      : undefined;
    const onUpdate = FOREIGN_KEY_ACTIONS.has(item.onUpdate as ForeignKeyAction)
      ? (item.onUpdate as ForeignKeyAction)
      : undefined;
    return [
      {
        id: toText(item.id, `legacy-foreign-key-${index}`),
        name,
        fields: toStringArray(item.fields),
        refSchema: toOptionalText(item.refSchema),
        refTable,
        refFields: toStringArray(item.refFields),
        ...(onDelete ? { onDelete } : {}),
        ...(onUpdate ? { onUpdate } : {}),
      },
    ];
  });
};

const decodeCitusConfig = (value: unknown): CitusShardingConfig | undefined => {
  if (!isRecord(value) || (value.mode !== 'reference' && value.mode !== 'distributed')) {
    return undefined;
  }
  return {
    mode: value.mode,
    ...(typeof value.distributionColumn === 'string'
      ? { distributionColumn: value.distributionColumn }
      : {}),
  };
};

const decodeMysqlPartitionConfig = (value: unknown): MysqlPartitionConfig | undefined => {
  if (!isRecord(value) || !MYSQL_PARTITION_TYPES.has(value.type as MysqlPartitionType)) {
    return undefined;
  }
  const partitions = Array.isArray(value.partitions)
    ? value.partitions.flatMap((item) =>
        isRecord(item) && typeof item.name === 'string' && typeof item.value === 'string'
          ? [{ name: item.name, value: item.value }]
          : [],
      )
    : undefined;
  return {
    enabled: value.enabled === true,
    type: value.type as MysqlPartitionType,
    columns: toStringArray(value.columns),
    ...(typeof value.expression === 'string' ? { expression: value.expression } : {}),
    ...(toOptionalFiniteNumber(value.partitionCount) === undefined
      ? {}
      : { partitionCount: toOptionalFiniteNumber(value.partitionCount) }),
    ...(partitions ? { partitions } : {}),
  };
};

const decodeHiveClustering = (value: unknown): HiveClusteringConfig | undefined => {
  if (!isRecord(value)) return undefined;
  return {
    enabled: value.enabled === true,
    columns: toStringArray(value.columns),
    bucketCount: toFiniteNumber(value.bucketCount, 0),
  };
};

const decodeHivePartitions = (value: unknown): HivePartitionConfig | undefined => {
  if (!isRecord(value)) return undefined;
  const clustering = decodeHiveClustering(value.clustering);
  return {
    enabled: value.enabled === true,
    columns: (Array.isArray(value.columns) ? value.columns : []).flatMap((item) =>
      isRecord(item) && typeof item.name === 'string' && typeof item.type === 'string'
        ? [{ name: item.name, type: item.type, comment: toText(item.comment) }]
        : [],
    ),
    ...(clustering ? { clustering } : {}),
  };
};

const decodeTableMiscConfig = (value: unknown): TableMiscConfig | undefined => {
  if (!isRecord(value)) return undefined;
  const storedAs =
    value.storedAs === 'ORC' ||
    value.storedAs === 'TEXTFILE' ||
    value.storedAs === 'PARQUET' ||
    value.storedAs === ''
      ? value.storedAs
      : undefined;
  const partitions = decodeHivePartitions(value.partitions);
  return {
    enabled: value.enabled === true,
    ...(toOptionalText(value.engine) === undefined ? {} : { engine: toOptionalText(value.engine) }),
    ...(toOptionalText(value.charset) === undefined
      ? {}
      : { charset: toOptionalText(value.charset) }),
    ...(toOptionalText(value.collation) === undefined
      ? {}
      : { collation: toOptionalText(value.collation) }),
    ...(toOptionalText(value.tablespace) === undefined
      ? {}
      : { tablespace: toOptionalText(value.tablespace) }),
    ...(toOptionalFiniteNumber(value.fillfactor) === undefined
      ? {}
      : { fillfactor: toOptionalFiniteNumber(value.fillfactor) }),
    ...(toOptionalFiniteNumber(value.pctfree) === undefined
      ? {}
      : { pctfree: toOptionalFiniteNumber(value.pctfree) }),
    ...(toOptionalFiniteNumber(value.initrans) === undefined
      ? {}
      : { initrans: toOptionalFiniteNumber(value.initrans) }),
    ...(storedAs === undefined ? {} : { storedAs }),
    ...(typeof value.external === 'boolean' ? { external: value.external } : {}),
    ...(toOptionalText(value.location) === undefined
      ? {}
      : { location: toOptionalText(value.location) }),
    ...(partitions ? { partitions } : {}),
  };
};

const decodeFieldTableViewConfig = (value: unknown): FieldTableViewConfig | undefined =>
  isRecord(value)
    ? {
        freezeEnabled: value.freezeEnabled === true,
        freezeColumns: toFiniteNumber(value.freezeColumns, 0),
      }
    : undefined;

const hasExternalStateShape = (value: Record<string, unknown>) =>
  typeof value.tableName === 'string' &&
  typeof value.tableComment === 'string' &&
  isDatabaseType(value.dbType) &&
  Array.isArray(value.rows) &&
  typeof value.addCount === 'number' &&
  Number.isFinite(value.addCount) &&
  typeof value.indexInput === 'string' &&
  Array.isArray(value.currentIndexFields) &&
  Array.isArray(value.indexes) &&
  typeof value.authInput === 'string' &&
  Array.isArray(value.authObjects);

const hasExternalSchemaDocumentShape = (value: Record<string, unknown>) =>
  typeof value.tableName === 'string' &&
  typeof value.tableComment === 'string' &&
  isDatabaseType(value.dbType) &&
  Array.isArray(value.rows) &&
  Array.isArray(value.indexes) &&
  typeof value.authInput === 'string' &&
  Array.isArray(value.authObjects);

export const decodePersistedState = (
  value: unknown,
  mode: PersistedStateDecodeMode = 'compatible',
): PersistedState | null => {
  if (!isRecord(value) || (mode === 'external' && !hasExternalStateShape(value))) return null;

  const explicitSchemaName = toText(value.schemaName);
  const rawTableName = toText(value.tableName);
  const { schema, table } =
    explicitSchemaName || !rawTableName.includes('.')
      ? { schema: explicitSchemaName, table: rawTableName }
      : splitQualifiedTableName(rawTableName);
  const dbType = isDatabaseType(value.dbType) ? value.dbType : 'mysql';
  const foreignKeys = decodeForeignKeys(value.foreignKeys);
  const citusShardingConfig = decodeCitusConfig(value.citusShardingConfig);
  const mysqlPartitionConfig = decodeMysqlPartitionConfig(value.mysqlPartitionConfig);
  const tableMiscConfig = decodeTableMiscConfig(value.tableMiscConfig);
  const fieldTableViewConfig = decodeFieldTableViewConfig(value.fieldTableViewConfig);

  return {
    ...(value.objectType === 'view' || value.objectType === 'table'
      ? { objectType: value.objectType }
      : {}),
    schemaName: schema,
    tableName: table,
    tableComment: toText(value.tableComment),
    dbType,
    sqlFormatMode: value.sqlFormatMode === 'aligned' ? 'aligned' : 'compact',
    ...(typeof value.viewDefinition === 'string' ? { viewDefinition: value.viewDefinition } : {}),
    ...(typeof value.viewCreateOrReplace === 'boolean'
      ? { viewCreateOrReplace: value.viewCreateOrReplace }
      : {}),
    rows: decodeRows(value.rows),
    addCount: toFiniteNumber(value.addCount, 10),
    indexInput: toText(value.indexInput),
    currentIndexFields: decodeIndexFields(value.currentIndexFields),
    indexes: decodeIndexes(value.indexes),
    authInput: toText(value.authInput),
    authObjects: toStringArray(value.authObjects),
    ...(citusShardingConfig ? { citusShardingConfig } : {}),
    ...(mysqlPartitionConfig ? { mysqlPartitionConfig } : {}),
    ...(tableMiscConfig ? { tableMiscConfig } : {}),
    ...(fieldTableViewConfig ? { fieldTableViewConfig } : {}),
    ...(foreignKeys ? { foreignKeys } : {}),
  };
};

export const decodeSchemaDocumentState = (value: unknown): SchemaDocumentState | null => {
  if (!isRecord(value) || !hasExternalSchemaDocumentShape(value)) return null;
  const state = decodePersistedState(value);
  return state ? toSchemaDocumentState(state) : null;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isOptionalString = (value: unknown) => value === undefined || typeof value === 'string';
const isOptionalFiniteNumber = (value: unknown) => value === undefined || isFiniteNumber(value);

export const decodeWorkspaceSnapshot = (value: unknown): WorkspaceSnapshot | null => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.drafts) ||
    !Array.isArray(value.savedTables) ||
    !Array.isArray(value.savedDrafts) ||
    !Array.isArray(value.folders)
  ) {
    return null;
  }

  let globalDraft: WorkspaceSnapshot['globalDraft'] = null;
  if (value.globalDraft !== null) {
    if (!isRecord(value.globalDraft) || !isFiniteNumber(value.globalDraft.updatedAt)) return null;
    const state = decodeSchemaDocumentState(value.globalDraft.state);
    if (!state) return null;
    globalDraft = { state, updatedAt: value.globalDraft.updatedAt };
  }

  const drafts: WorkspaceSnapshot['drafts'] = [];
  for (const item of value.drafts) {
    if (
      !isRecord(item) ||
      typeof item.draftId !== 'string' ||
      !item.draftId ||
      !isOptionalFiniteNumber(item.createdAt) ||
      !isFiniteNumber(item.updatedAt) ||
      !isOptionalString(item.folderId)
    ) {
      return null;
    }
    const state = decodeSchemaDocumentState(item.state);
    if (!state) return null;
    drafts.push({
      draftId: item.draftId,
      state,
      ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
      updatedAt: item.updatedAt,
      ...(item.folderId === undefined ? {} : { folderId: item.folderId }),
    });
  }

  const savedTables: WorkspaceSnapshot['savedTables'] = [];
  for (const item of value.savedTables) {
    if (
      !isRecord(item) ||
      typeof item.normalizedName !== 'string' ||
      !item.normalizedName ||
      typeof item.name !== 'string' ||
      !isOptionalFiniteNumber(item.createdAt) ||
      !isFiniteNumber(item.updatedAt) ||
      !isOptionalString(item.folderId)
    ) {
      return null;
    }
    const state = decodeSchemaDocumentState(item.state);
    if (!state) return null;
    savedTables.push({
      normalizedName: item.normalizedName,
      name: item.name,
      state,
      ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
      updatedAt: item.updatedAt,
      ...(item.folderId === undefined ? {} : { folderId: item.folderId }),
    });
  }

  const savedDrafts: WorkspaceSnapshot['savedDrafts'] = [];
  for (const item of value.savedDrafts) {
    if (
      !isRecord(item) ||
      typeof item.normalizedName !== 'string' ||
      !item.normalizedName ||
      typeof item.tableName !== 'string' ||
      typeof item.baseSignature !== 'string' ||
      !isFiniteNumber(item.updatedAt)
    ) {
      return null;
    }
    const state = decodeSchemaDocumentState(item.state);
    if (!state) return null;
    savedDrafts.push({
      normalizedName: item.normalizedName,
      tableName: item.tableName,
      baseSignature: item.baseSignature,
      updatedAt: item.updatedAt,
      state,
    });
  }

  const folders: WorkspaceSnapshot['folders'] = [];
  for (const item of value.folders) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      !item.id ||
      typeof item.name !== 'string' ||
      !isOptionalString(item.parentId) ||
      !isFiniteNumber(item.order) ||
      !isFiniteNumber(item.createdAt)
    ) {
      return null;
    }
    folders.push({
      id: item.id,
      name: item.name,
      ...(item.parentId === undefined ? {} : { parentId: item.parentId }),
      order: item.order,
      createdAt: item.createdAt,
    });
  }

  return normalizeWorkspaceSnapshot({ globalDraft, drafts, savedTables, savedDrafts, folders });
};
