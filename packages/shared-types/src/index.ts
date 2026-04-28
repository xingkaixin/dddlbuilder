export type DatabaseType =
  | 'mysql'
  | 'postgresql'
  | 'postgresql-citus'
  | 'sqlserver'
  | 'oracle'
  | 'mariadb'
  | 'tidb'
  | 'dm'
  | 'oceanbase'
  | 'oceanbase-oracle'
  | 'kingbase'
  | 'gbase'
  | 'polardb'
  | 'gaussdb'
  | 'hive';

export type EnumValueMeta = {
  value: string;
  color?: string;
  i18n?: Record<string, string>;
};

export type FieldRow = {
  order: number;
  fieldName: string;
  fieldType: string;
  fieldComment: string;
  nullable: string;
  defaultKind?: string;
  defaultValue?: string;
  onUpdate?: string;
  enumMeta?: EnumValueMeta[];
};

export type NormalizedField = {
  name: string;
  type: string;
  comment: string;
  nullable: boolean;
  defaultKind: 'none' | 'auto_increment' | 'constant' | 'current_timestamp' | 'uuid';
  defaultValue: string;
  onUpdate: 'none' | 'current_timestamp';
  enumMeta?: EnumValueMeta[];
};

export type IndexField = {
  name: string;
  direction: 'ASC' | 'DESC';
};

export type IndexDefinition = {
  id: string;
  name: string;
  fields: IndexField[];
  unique: boolean;
  isPrimary?: boolean;
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

export type ParsedFieldType = {
  baseType: string;
  args: string[];
  unsigned: boolean;
  raw: string;
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

export type UiDefaultKind = '无' | '自增' | '常量' | '当前时间' | 'uuid';
export type UiOnUpdate = '无' | '当前时间';

// Citus 分片模式
export type CitusTableMode = 'reference' | 'distributed';

// Citus 分片配置
export type CitusShardingConfig = {
  mode: CitusTableMode;
  distributionColumn?: string; // 仅当 mode 为 'distributed' 时需要
};

// MySQL 分区类型
export type MysqlPartitionType =
  | 'RANGE'
  | 'RANGE COLUMNS'
  | 'LIST'
  | 'LIST COLUMNS'
  | 'HASH'
  | 'KEY';

// 分区定义（用于 RANGE/LIST 类型）
export type PartitionDefinition = {
  name: string; // 分区名称，如 p2024
  value: string; // 分区值，如 '2025-01-01' 或 MAXVALUE
};

// MySQL 分区配置
export type MysqlPartitionConfig = {
  enabled: boolean; // 是否启用分区
  type: MysqlPartitionType; // 分区类型
  columns: string[]; // 分区字段（支持多列）
  expression?: string; // 分区表达式（HASH/KEY/RANGE 可使用函数，如 dayofmonth(col)）
  partitionCount?: number; // 分区数量（HASH/KEY 类型）
  partitions?: PartitionDefinition[]; // 分区定义（RANGE/LIST 类型）
};

// Hive 分区列定义
export type HivePartitionColumn = {
  name: string; // 分区列名
  type: string; // 分区列类型（STRING, INT, BIGINT 等）
  comment: string; // 分区列注释
};

// Hive 分桶配置（CLUSTERED BY）
export type HiveClusteringConfig = {
  enabled: boolean; // 是否启用分桶
  columns: string[]; // 分桶列名
  bucketCount: number; // 桶数量
};

// Hive 分区配置（PARTITIONED BY + CLUSTERED BY）
export type HivePartitionConfig = {
  enabled: boolean; // 是否启用分区
  columns: HivePartitionColumn[]; // 分区列定义
  clustering?: HiveClusteringConfig; // 分桶配置（可选）
};

// 表级杂项配置
export type TableMiscConfig = {
  enabled: boolean; // 是否启用杂项设置
  engine?: string; // 表引擎（MySQL 系）
  charset?: string; // 表字符集（MySQL 系）
  collation?: string; // 表排序规则（MySQL 系）
  tablespace?: string; // 表空间（部分数据库）
  fillfactor?: number; // PostgreSQL 页面填充率 (10-100)
  pctfree?: number; // Oracle STORAGE PCTFREE (0-99)
  initrans?: number; // Oracle STORAGE INITRANS (1-255)
  storedAs?: 'ORC' | 'TEXTFILE' | 'PARQUET' | ''; // 存储格式（Hive）
  external?: boolean; // 是否外部表（Hive）
  location?: string; // 存储路径（Hive）
  partitions?: HivePartitionConfig; // 分区配置（Hive）
};

export type FieldTableViewConfig = {
  freezeEnabled: boolean; // 是否启用左侧列冻结
  freezeColumns: number; // 冻结列数（从左到右）
};

export type PersistedState = {
  objectType?: SchemaObjectType;
  schemaName: string;
  tableName: string;
  tableComment: string;
  dbType: DatabaseType;
  sqlFormatMode: SqlFormatMode;
  viewDefinition?: string;
  viewCreateOrReplace?: boolean;
  rows: FieldRow[];
  addCount: number;
  indexInput: string;
  currentIndexFields: IndexField[];
  indexes: IndexDefinition[];
  authInput: string;
  authObjects: string[];
  citusShardingConfig?: CitusShardingConfig;
  mysqlPartitionConfig?: MysqlPartitionConfig;
  tableMiscConfig?: TableMiscConfig;
  fieldTableViewConfig?: FieldTableViewConfig;
  foreignKeys?: ForeignKeyDefinition[];
};

export type { ApiErrorCode, ApiMeta, ApiErrorPayload } from './api.js';
export type {
  WorkspaceSource,
  WorkspaceScope,
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
} from './aiGenerate.js';
export type { ErNodeData, ErEdgeData } from './erDiagram.js';
