import type {
  CitusShardingConfig,
  DatabaseType,
  FieldRow,
  IndexDefinition,
  MysqlPartitionConfig,
  PersistedState,
  TableMiscConfig,
} from '@ddlbuilder/shared-types';

export type SavedTableRecord = {
  tableId?: string;
  normalizedName: string;
  name: string;
  state: PersistedState;
  scope?: string;
  folderId?: string;
  trashedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type SavedTableMetadata = {
  tableId: string;
  normalizedName: string;
  name: string;
  dbType: string;
  fieldCount: number;
  scope?: string;
  folderId?: string;
  trashedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type TableFolder = {
  id: string;
  scope?: string;
  name: string;
  parentId?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
};

export type TemplateField = Omit<FieldRow, 'id' | 'fieldComment'> & {
  fieldComment?: FieldRow['fieldComment'];
};

export type FieldTemplate = {
  id: string;
  name: string;
  description?: string;
  keywords?: string[];
  fields: TemplateField[];
  createdAt: number;
  updatedAt: number;
};

export type TableBlueprint = {
  dbType: DatabaseType;
  rows: FieldRow[];
  indexes: IndexDefinition[];
  citusShardingConfig?: CitusShardingConfig;
  mysqlPartitionConfig?: MysqlPartitionConfig;
  tableMiscConfig?: TableMiscConfig;
};

export type TableTemplate = {
  id: string;
  name: string;
  description?: string;
  blueprint: TableBlueprint;
  createdAt: number;
  updatedAt: number;
};

export type TableVersion = {
  id: string;
  tableKey?: string;
  tableId?: string;
  tableNormalizedName: string;
  state: PersistedState;
  message?: string;
  createdAt: number;
};

export type TableVersionMetadata = {
  id: string;
  tableNormalizedName: string;
  message?: string;
  dbType: string;
  fieldCount: number;
  createdAt: number;
};
