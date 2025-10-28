// Re-export the refactored App component
export { default } from "./components/App";

// Re-export utility functions for external use
export {
  parseFieldType,
  canonicalizeBaseType,
  getFieldTypeForDatabase,
  getCanonicalBaseType,
  splitQualifiedName,
  getSchemaAndTable,
  escapeSingleQuotes,
  formatConstantDefault,
  shouldQuoteDefault,
  isLikelyFunctionOrKeyword,
  TYPE_ALIASES,
} from "./utils/databaseTypeMapping";

export {
  buildDDL,
  buildDCL,
  buildOracleSynonyms,
} from "./utils/ddlGenerators";

export {
  normalizeFields,
  toStringSafe,
  normalizeBoolean,
  normalizeDefaultKind,
  normalizeOnUpdate,
  createEmptyRow,
  ensureOrder,
  sanitizeRowsForPersist,
  getUiDefaultKindOptions,
  getUiOnUpdateOptions,
  isIntegerType,
  isCharacterType,
  supportsUuidDefault,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
  isReservedKeyword,
  formatMysqlTableName,
  formatPostgresTableName,
} from "./utils/helpers";

export {
  sanitizeIndexesForPersist,
} from "./utils/indexUtils";

export {
  DATABASE_OPTIONS,
  YES_VALUES,
  DEFAULT_KIND_OPTIONS,
  ON_UPDATE_OPTIONS,
  COLUMN_HEADERS,
  STORAGE_KEY,
  RESERVED_KEYWORDS,
} from "./utils/constants";

export type {
  DatabaseType,
  FieldRow,
  NormalizedField,
  IndexField,
  IndexDefinition,
  UiDefaultKind,
  UiOnUpdate,
  ParsedFieldType,
  PersistedState,
} from "./types";