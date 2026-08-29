import type {
  CitusShardingConfig,
  MysqlPartitionConfig,
  PersistedState,
  SchemaDocumentState,
  TableMiscConfig,
} from '@ddlbuilder/shared-types';
import { normalizeAddCount, normalizeFreezeColumns } from '@ddlbuilder/shared-types';
import { digest } from 'lib0/hash/sha256';
import { toSchemaDocumentState } from '@ddlbuilder/shared-types';

type JsonLike = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonLike =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, sortValue(value[key])]),
  );
};

const hasText = (value: unknown) => typeof value === 'string' && value.length > 0;

const isInactiveMysqlPartitionConfig = (config: MysqlPartitionConfig | undefined) =>
  !config ||
  (config.enabled === false &&
    (config.columns?.length ?? 0) === 0 &&
    !hasText(config.expression) &&
    (config.partitions?.length ?? 0) === 0);

const isInactiveTableMiscConfig = (config: TableMiscConfig | undefined) => {
  if (!config) return true;
  const partitions = config.partitions;
  const hasPartitions =
    Boolean(partitions?.enabled) ||
    (partitions?.columns?.length ?? 0) > 0 ||
    Boolean(partitions?.clustering);
  return (
    config.enabled === false &&
    !hasText(config.engine) &&
    !hasText(config.charset) &&
    !hasText(config.collation) &&
    !hasText(config.tablespace) &&
    config.fillfactor == null &&
    config.pctfree == null &&
    config.initrans == null &&
    !hasText(config.storedAs) &&
    config.external !== true &&
    !hasText(config.location) &&
    !hasPartitions
  );
};

const isDefaultCitusShardingConfig = (config: CitusShardingConfig | undefined) =>
  !config || (config.mode === 'reference' && !config.distributionColumn);

export const normalizeSchemaStateForSignature = (state: SchemaDocumentState) => {
  const normalized = {
    ...toSchemaDocumentState(state),
    rows: state.rows.map((row) => {
      const { order: _legacyOrder, ...content } = row as typeof row & { order?: unknown };
      return content;
    }),
  };

  if (!normalized.objectType || normalized.objectType === 'table') {
    delete normalized.objectType;
  }
  if (!normalized.viewDefinition) {
    delete normalized.viewDefinition;
  }
  if (normalized.viewCreateOrReplace !== false) {
    delete normalized.viewCreateOrReplace;
  }
  if ((normalized.foreignKeys?.length ?? 0) === 0) {
    delete normalized.foreignKeys;
  }
  if (isInactiveMysqlPartitionConfig(normalized.mysqlPartitionConfig)) {
    delete normalized.mysqlPartitionConfig;
  }
  if (isInactiveTableMiscConfig(normalized.tableMiscConfig)) {
    delete normalized.tableMiscConfig;
  }
  if (isDefaultCitusShardingConfig(normalized.citusShardingConfig)) {
    delete normalized.citusShardingConfig;
  }

  return sortValue(normalized);
};

export const buildSchemaStateSignature = (state: SchemaDocumentState) => {
  const bytes = new TextEncoder().encode(JSON.stringify(normalizeSchemaStateForSignature(state)));
  return `sha256:${Array.from(digest(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

export const normalizePersistedStateForSignature = (state: PersistedState) => ({
  schema: normalizeSchemaStateForSignature(state),
  editorSession: {
    sqlFormatMode: state.sqlFormatMode,
    addCount: normalizeAddCount(state.addCount),
    fieldTableViewConfig: {
      freezeEnabled: state.fieldTableViewConfig?.freezeEnabled ?? false,
      freezeColumns: normalizeFreezeColumns(state.fieldTableViewConfig?.freezeColumns ?? 3),
    },
  },
});

export const buildPersistedStateSignature = (state: PersistedState) => {
  const bytes = new TextEncoder().encode(
    JSON.stringify(normalizePersistedStateForSignature(state)),
  );
  return `sha256:${Array.from(digest(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};
