export { DATABASE_TYPES, isDatabaseType } from './database.js';
export type { DatabaseType, ParsedFieldType } from './database.js';
export { createEntityId } from './identity.js';
export {
  normalizeAddCount,
  normalizeFillfactor,
  normalizeFreezeColumns,
  normalizeHiveBucketCount,
  normalizeInitrans,
  normalizeMysqlPartitionCount,
  normalizeOptionalMysqlPartitionCount,
  normalizePctfree,
  normalizeTableMiscConfigNumbers,
} from './stateNumbers.js';
export type {
  EnumValueMeta,
  FieldDefaultKind,
  FieldOnUpdate,
  FieldRow,
  NormalizedField,
} from './fieldRow.js';
export {
  ensureFieldId,
  FIELD_DEFAULT_KINDS,
  FIELD_ON_UPDATES,
  normalizeFieldDefaultKind,
  normalizeFieldEnums,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
  normalizePersistedRows,
} from './fieldRow.js';
export {
  DEFAULT_EDITOR_SESSION_STATE,
  toEditorSessionState,
  toSchemaDocumentState,
  withDefaultEditorSession,
  withEditorSession,
} from './schema.js';
export type {
  CitusShardingConfig,
  CitusTableMode,
  EditorSessionState,
  FieldTableViewConfig,
  ForeignKeyAction,
  ForeignKeyDefinition,
  HiveClusteringConfig,
  HivePartitionColumn,
  HivePartitionConfig,
  IndexDefinition,
  IndexField,
  MysqlPartitionConfig,
  MysqlPartitionType,
  PartitionDefinition,
  PersistedState,
  RoutineTemplateConfig,
  RoutineTemplateKind,
  SchemaDocumentState,
  SchemaObjectType,
  SqlFormatMode,
  TableMiscConfig,
} from './schema.js';
export type { ApiErrorCode, ApiMeta, ApiErrorPayload } from './api.js';
export { encodeAIStreamEvent } from './aiStream.js';
export type { AIStreamEvent } from './aiStream.js';
export { WORKSPACE_SYNC_MESSAGE } from './workspaceSync.js';
export type {
  WorkspaceSource,
  WorkspaceSelection,
  AnonymousWorkspaceScope,
  LegacyUserWorkspaceScope,
  UserWorkspaceScope,
  WorkspaceScope,
  WorkspaceEntityType,
  CurrentWorkspaceResponse,
  WorkspaceSavePayload,
  SavedTableDraftRecord,
  DraftSummary,
  WorkspaceSnapshot,
} from './workspace.js';
export type { AppLocale } from './locale.js';
export { APP_LOCALES, isAppLocale } from './locale.js';
export type {
  GeneratedTableSchema,
  GeneratedField,
  GeneratedIndex,
  GeneratedDesignDecision,
  ConversationMessage,
  PartialTableSchema,
  AICommentMode,
  AICommentRequest,
  AICommentResult,
  AICommentFieldInput,
  AICommentFieldResult,
  AIIndexAdvisorFieldInput,
  AIIndexAdvisorIndexInput,
  AIIndexAdvisorRequest,
  AIIndexAdvisorRecommendation,
  AIIndexAdvisorRecommendationCategory,
  AIIndexAdvisorResult,
} from './aiGenerate.js';

export { splitQualifiedName, getSchemaAndTable } from './qualifiedName';

export { indexKindOf, isIndexKind, type IndexKind } from './indexKind';
