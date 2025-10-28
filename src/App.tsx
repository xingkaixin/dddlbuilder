// Re-export the refactored App component
export { default } from "./components/App";

// Re-export utility functions for external use
export {
  parseFieldType,
  getFieldTypeForDatabase,
  getCanonicalBaseType,
} from "./utils/databaseTypeMapping";

export {
  buildDDL,
  buildDCL,
} from "./utils/ddlGenerators";

export {
  normalizeFields,
  isReservedKeyword,
  toStringSafe,
} from "./utils/helpers";

export {
  buildMysqlDDL,
  buildPostgresDDL,
  buildSqlServerDDL,
  buildOracleDDL,
  buildOracleSynonyms,
  escapeSingleQuotes,
  formatConstantDefault,
  shouldQuoteDefault,
  isLikelyFunctionOrKeyword,
  splitQualifiedName,
  getSchemaAndTable,
  formatMysqlTableName,
  formatPostgresTableName,
} from "./utils/ddlGenerators";

export {
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

export {
  TYPE_ALIASES,
  canonicalizeBaseType,
  mapTypeForMysql,
  mapTypeForPostgres,
  mapTypeForSqlServer,
  mapTypeForOracle,
} from "./utils/databaseTypeMapping";

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