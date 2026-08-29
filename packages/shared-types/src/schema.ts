import type { IndexKind } from './indexKind';
import type { DatabaseType } from './database.js';
import type { FieldRow } from './fieldRow.js';

export type IndexField = {
  name: string;
  direction: 'ASC' | 'DESC';
};

export type IndexDefinition = {
  id: string;
  name: string;
  fields: IndexField[];
  kind: IndexKind;
};

export type ForeignKeyAction = 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';

export type ForeignKeyDefinition = {
  id: string;
  name: string;
  fields: string[];
  refSchema?: string;
  refTable: string;
  refFields: string[];
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
};

export type SqlFormatMode = 'compact' | 'aligned';
export type SchemaObjectType = 'table' | 'view';
export type RoutineTemplateKind =
  | 'procedure'
  | 'function'
  | 'updated_at_trigger'
  | 'audit_trigger'
  | 'custom_trigger';

export type RoutineTemplateConfig = {
  kind: RoutineTemplateKind;
  routineName: string;
  tableName?: string;
  parameters?: string;
  returnType?: string;
  body?: string;
  timestampColumn?: string;
  auditTableName?: string;
};

export type CitusTableMode = 'reference' | 'distributed';

export type CitusShardingConfig = {
  mode: CitusTableMode;
  distributionColumn?: string;
};

export type MysqlPartitionType =
  | 'RANGE'
  | 'RANGE COLUMNS'
  | 'LIST'
  | 'LIST COLUMNS'
  | 'HASH'
  | 'KEY';

export type PartitionDefinition = {
  id: string;
  name: string;
  value: string;
};

export type MysqlPartitionConfig = {
  enabled: boolean;
  type: MysqlPartitionType;
  columns: string[];
  expression?: string;
  partitionCount?: number;
  partitions?: PartitionDefinition[];
};

export type HivePartitionColumn = {
  name: string;
  type: string;
  comment: string;
};

export type HiveClusteringConfig = {
  enabled: boolean;
  columns: string[];
  bucketCount: number;
};

export type HivePartitionConfig = {
  enabled: boolean;
  columns: HivePartitionColumn[];
  clustering?: HiveClusteringConfig;
};

export type TableMiscConfig = {
  enabled: boolean;
  engine?: string;
  charset?: string;
  collation?: string;
  tablespace?: string;
  fillfactor?: number;
  pctfree?: number;
  initrans?: number;
  storedAs?: 'ORC' | 'TEXTFILE' | 'PARQUET' | '';
  external?: boolean;
  location?: string;
  partitions?: HivePartitionConfig;
};

export type FieldTableViewConfig = {
  freezeEnabled: boolean;
  freezeColumns: number;
};

export type SchemaDocumentState = {
  objectType?: SchemaObjectType;
  schemaName: string;
  tableName: string;
  tableComment: string;
  dbType: DatabaseType;
  viewDefinition?: string;
  viewCreateOrReplace?: boolean;
  rows: FieldRow[];
  indexes: IndexDefinition[];
  authInput: string;
  authObjects: string[];
  citusShardingConfig?: CitusShardingConfig;
  mysqlPartitionConfig?: MysqlPartitionConfig;
  tableMiscConfig?: TableMiscConfig;
  foreignKeys?: ForeignKeyDefinition[];
};

export type EditorSessionState = {
  sqlFormatMode: SqlFormatMode;
  addCount: number;
  fieldTableViewConfig?: FieldTableViewConfig;
};

export type PersistedState = SchemaDocumentState & EditorSessionState;

export const DEFAULT_EDITOR_SESSION_STATE: Readonly<EditorSessionState> = {
  sqlFormatMode: 'compact',
  addCount: 10,
};

export const toSchemaDocumentState = (state: SchemaDocumentState): SchemaDocumentState => ({
  objectType: state.objectType,
  schemaName: state.schemaName,
  tableName: state.tableName,
  tableComment: state.tableComment,
  dbType: state.dbType,
  viewDefinition: state.viewDefinition,
  viewCreateOrReplace: state.viewCreateOrReplace,
  rows: state.rows,
  indexes: state.indexes,
  authInput: state.authInput,
  authObjects: state.authObjects,
  citusShardingConfig: state.citusShardingConfig,
  mysqlPartitionConfig: state.mysqlPartitionConfig,
  tableMiscConfig: state.tableMiscConfig,
  foreignKeys: state.foreignKeys,
});

export const withDefaultEditorSession = (state: SchemaDocumentState): PersistedState => ({
  ...state,
  ...DEFAULT_EDITOR_SESSION_STATE,
});

export const toEditorSessionState = (state: EditorSessionState): EditorSessionState => ({
  sqlFormatMode: state.sqlFormatMode,
  addCount: state.addCount,
  fieldTableViewConfig: state.fieldTableViewConfig,
});

export const withEditorSession = (
  state: SchemaDocumentState,
  session: EditorSessionState,
): PersistedState => ({
  ...state,
  ...toEditorSessionState(session),
});
