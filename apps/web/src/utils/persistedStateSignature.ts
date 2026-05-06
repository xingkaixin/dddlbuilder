import type {
  CitusShardingConfig,
  FieldTableViewConfig,
  MysqlPartitionConfig,
  PersistedState,
  TableMiscConfig,
} from '@ddlbuilder/shared-types';

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

const isDefaultFieldTableViewConfig = (config: FieldTableViewConfig | undefined) =>
  !config || (config.freezeEnabled === false && config.freezeColumns === 3);

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

export const normalizePersistedStateForSignature = (state: PersistedState) => {
  const normalized: PersistedState = { ...state };

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
  if (isDefaultFieldTableViewConfig(normalized.fieldTableViewConfig)) {
    delete normalized.fieldTableViewConfig;
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

export const serializePersistedStateForComparison = (state: PersistedState) =>
  JSON.stringify(normalizePersistedStateForSignature(state));
