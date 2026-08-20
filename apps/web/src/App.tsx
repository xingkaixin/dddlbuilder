// Re-export the refactored App component
export { default } from './components/App';

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
} from '@ddlbuilder/ddl-core';

export {
  buildDDL,
  buildDCL,
  buildOracleSynonyms,
  buildViewDDL,
  buildRoutineTemplateDDL,
} from '@ddlbuilder/ddl-core';

export {
  normalizeFields,
  toStringSafe,
  createEmptyRow,
  ensureOrder,
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
} from './utils/helpers';

export { sanitizeIndexesForPersist } from './utils/indexUtils';

export {
  DATABASE_OPTIONS,
  COLUMN_HEADERS,
  STORAGE_KEY,
  RESERVED_KEYWORDS,
} from './utils/constants';

export type {
  ApiErrorCode,
  ApiErrorPayload,
  ApiMeta,
  DatabaseType,
  FieldRow,
  NormalizedField,
  IndexField,
  IndexDefinition,
  FieldDefaultKind,
  FieldOnUpdate,
  ParsedFieldType,
  PersistedState,
  SqlFormatMode,
  TableMiscConfig,
  RoutineTemplateConfig,
  RoutineTemplateKind,
} from '@ddlbuilder/shared-types';
