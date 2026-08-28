export {
  buildDDL,
  buildDCL,
  buildOracleSynonyms,
  buildViewDDL,
  type BuildDDLInput,
} from './utils/ddlGenerators.js';
export { buildRoutineTemplateDDL } from './utils/routineTemplates.js';
export {
  getDatabaseFamily,
  getSqlParserDialect,
  quoteIdentifier,
  supportsMysqlPartition,
  type DatabaseFamily,
  type SqlParserDialect,
} from './utils/databaseFamily.js';
export { diffPersistedState } from './utils/tableDiff.js';
export { getForeignKeyActions, getForeignKeyIssue } from './utils/foreignKeys.js';
export type {
  TableDiff,
  FieldDiff,
  IndexDiff,
  ForeignKeyDiff,
  FieldDiffType,
  IndexDiffType,
  ForeignKeyDiffType,
  FieldChangeType,
} from './utils/tableDiff.js';
export {
  getFieldTypeForDatabase,
  parseFieldType,
  getCanonicalBaseType,
  supportsUuidDefault,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
  formatConstantDefault,
  shouldQuoteDefault,
  escapeSingleQuotes,
  splitQualifiedName,
  getSchemaAndTable,
  buildQualifiedTableName,
} from './utils/databaseTypeMapping.js';
export { TYPE_ALIASES, canonicalizeBaseType } from './utils/typeAliases.js';
export { buildPrimaryKeyName } from './utils/primaryKeyNaming.js';
export { getSqlIdentifierKey, unquoteSqlIdentifier } from './utils/sqlIdentifiers.js';
export {
  renameSqlExpressionFields,
  sqlExpressionReferencesField,
} from './utils/sqlExpressionIdentifiers.js';
export {
  buildIndexName,
  truncateIdentifierName,
  getIdentifierNameMaxLength,
  DEFAULT_IDENTIFIER_NAME_MAX_LENGTH,
  ORACLE_IDENTIFIER_NAME_MAX_LENGTH,
} from './utils/identifierNaming.js';
export {
  generateAlterDDL,
  generateRollbackDDL,
  generateTableCommentAlter,
  generateDropColumn,
  generateRenameColumn,
  generateAddColumn,
  generateModifyColumn,
  buildDefaultClause,
  generateAddIndex,
  generateDropIndex,
  generateAddForeignKey,
  generateDropForeignKey,
} from './utils/alter-ddl/index.js';
export {
  supportsStorageOption,
  supportsEngineOption,
  supportsCharsetOption,
  supportsCollationOption,
  supportsTablespaceOption,
  supportsFillfactorOption,
  supportsOracleStorageOption,
  buildTableOptionsClause,
} from './utils/tableOptions.js';
export { buildORM } from './utils/ormGenerators.js';
export {
  estimateStorage,
  estimateStorageBreakdown,
  type StorageBreakdown,
  type StorageProfile,
  type StorageResult,
} from './utils/storageEstimator.js';
export { ORMGeneratorFactory } from './factories/ORMGeneratorFactory.js';
export type { ORMGenerator, ORMModelInput, ORMTarget } from './interfaces/ORMGenerator.js';
export { mapCanonicalToORMType, getORMTypeWithArgs } from './utils/ormTypeResolver.js';

export { RESERVED_KEYWORDS } from './configs/reservedKeywords';
