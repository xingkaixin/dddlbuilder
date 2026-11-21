/* oxlint-disable anti-slop/no-runtime-typeof -- Signature normalization recursively inspects raw JSON-like values. */
/* oxlint-disable anti-slop/no-unknown-parameters -- Recursive normalization accepts raw JSON-like values by contract. */
/* oxlint-disable anti-slop/no-unknown-returns -- Recursive sorting preserves the raw JSON-like value domain until serialization. */
/* oxlint-disable anti-slop/no-unsafe-dictionary-type -- Signature normalization intentionally traverses open JSON records. */

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

type TextEncoderRuntime = typeof globalThis & {
  TextEncoder: new () => {
    encode: (input: string) => Uint8Array;
  };
};

let cachedTextEncoder: { encode: (input: string) => Uint8Array } | null = null;

const encodeUtf8 = (input: string): Uint8Array => {
  if (!cachedTextEncoder) {
    // SAFETY: browser and Worker runtimes provide globalThis.TextEncoder.
    const runtime = globalThis as TextEncoderRuntime;
    cachedTextEncoder = new runtime.TextEncoder();
  }

  return cachedTextEncoder.encode(input);
};

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
  const normalized = toSchemaDocumentState(state);

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

// Callers treat schema states as immutable values, so the object identity is a safe cache key.
const schemaStateSignatures = new WeakMap<SchemaDocumentState, string>();

export const buildSchemaStateSignature = (state: SchemaDocumentState) => {
  const cached = schemaStateSignatures.get(state);

  if (cached) return cached;
  const bytes = encodeUtf8(JSON.stringify(normalizeSchemaStateForSignature(state)));
  const signature = `sha256:${Array.from(digest(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  schemaStateSignatures.set(state, signature);

  return signature;
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

const persistedStateSignatures = new WeakMap<PersistedState, string>();

export const buildPersistedStateSignature = (state: PersistedState) => {
  const cached = persistedStateSignatures.get(state);

  if (cached) return cached;
  const bytes = encodeUtf8(JSON.stringify(normalizePersistedStateForSignature(state)));
  const signature = `sha256:${Array.from(digest(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  persistedStateSignatures.set(state, signature);

  return signature;
};
