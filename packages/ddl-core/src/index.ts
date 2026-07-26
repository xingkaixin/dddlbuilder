export * from './strategies/index.js';
export type { DDLStrategy } from './interfaces/DDLStrategy.js';
export { DDLStrategyFactory } from './factories/DDLStrategyFactory.js';
export { buildDDL, buildDCL, buildOracleSynonyms, buildViewDDL } from './utils/ddlGenerators.js';
export { buildRoutineTemplateDDL } from './utils/routineTemplates.js';
export { diffPersistedState } from './utils/tableDiff.js';
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
export { TYPE_MAPPINGS } from './configs/typeMappings.js';
export {
  TYPE_ALIASES,
  canonicalizeBaseType,
  getFieldTypeForDatabase,
  parseFieldType,
  getCanonicalBaseType,
  supportsUuidDefault,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
  getOracleTimestampDefault,
  formatConstantDefault,
  shouldQuoteDefault,
  isLikelyFunctionOrKeyword,
  escapeSingleQuotes,
  splitQualifiedName,
  getSchemaAndTable,
  buildQualifiedTableName,
} from './utils/databaseTypeMapping.js';
export { buildPrimaryKeyName } from './utils/primaryKeyNaming.js';
export {
  buildIndexName,
  truncateIdentifierName,
  getIdentifierNameMaxLength,
  DEFAULT_IDENTIFIER_NAME_MAX_LENGTH,
  ORACLE_IDENTIFIER_NAME_MAX_LENGTH,
} from './utils/identifierNaming.js';
export { TypeMapper } from './utils/TypeMapper.js';
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
export { ORMGeneratorFactory } from './factories/ORMGeneratorFactory.js';
export type { ORMGenerator, ORMTarget } from './interfaces/ORMGenerator.js';
export { mapCanonicalToORMType, getORMTypeWithArgs } from './utils/ormTypeResolver.js';
