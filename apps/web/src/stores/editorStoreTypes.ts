import type { StoreApi } from 'zustand';
import type {
  CitusShardingConfig,
  CitusTableMode,
  DatabaseType,
  FieldRow,
  ForeignKeyDefinition,
  HivePartitionConfig,
  IndexDefinition,
  IndexField,
  MysqlPartitionConfig,
  MysqlPartitionType,
  PartitionDefinition,
  PersistedState,
  SchemaObjectType,
  SqlFormatMode,
  TableMiscConfig,
} from '@ddlbuilder/shared-types';
import type { BuilderTab } from '@/utils/tabUtils';

type Setter<T> = T | ((previous: T) => T);

type CoreDialogState = Record<'save' | 'rename' | 'delete', boolean>;

interface VersionHistoryTarget {
  normalizedName: string;
  name: string;
}

export interface AppSlice {
  schemaName: string;
  tableName: string;
  tableComment: string;
  objectType: SchemaObjectType;
  viewDefinition: string;
  viewCreateOrReplace: boolean;
  dbType: DatabaseType;
  sqlFormatMode: SqlFormatMode;
  addCount: number;
  fieldTableFreezeEnabled: boolean;
  fieldTableFreezeColumns: number;
  activeTab: BuilderTab;
  savedTablesDrawerOpen: boolean;
  dialogs: CoreDialogState;
  isClearDialogOpen: boolean;
  showFireworks: boolean;
  isDiffDialogOpen: boolean;
  versionHistoryTarget: VersionHistoryTarget | null;
  isReviewHistoryOpen: boolean;
  isStorageEstimatorOpen: boolean;
  isAIGenerateDialogOpen: boolean;
  isMockDataDialogOpen: boolean;
  timelinePlayerTarget: VersionHistoryTarget | null;
  setSchemaName: (value: string) => void;
  setTableName: (value: string) => void;
  setTableComment: (value: string) => void;
  setObjectType: (value: SchemaObjectType) => void;
  setViewDefinition: (value: string) => void;
  setViewCreateOrReplace: (value: boolean) => void;
  setDbType: (value: DatabaseType) => void;
  setSqlFormatMode: (value: SqlFormatMode) => void;
  setAddCount: (value: number) => void;
  setFieldTableFreezeEnabled: (value: boolean) => void;
  setFieldTableFreezeColumns: (value: number) => void;
  setActiveTab: (value: BuilderTab) => void;
  resetTableConfig: () => void;
  resetTableViewConfig: () => void;
  setSavedTablesDrawerOpen: (value: boolean) => void;
  setIsSaveDialogOpen: (value: boolean) => void;
  setIsRenameDialogOpen: (value: boolean) => void;
  setIsDeleteDialogOpen: (value: boolean) => void;
  setIsClearDialogOpen: (value: boolean) => void;
  setShowFireworks: (value: boolean) => void;
  setIsDiffDialogOpen: (value: boolean) => void;
  setVersionHistoryTarget: (value: VersionHistoryTarget | null) => void;
  setIsReviewHistoryOpen: (value: boolean) => void;
  setIsStorageEstimatorOpen: (value: boolean) => void;
  setIsAIGenerateDialogOpen: (value: boolean) => void;
  setIsMockDataDialogOpen: (value: boolean) => void;
  setTimelinePlayerTarget: (value: VersionHistoryTarget | null) => void;
}

export interface FieldSlice {
  rows: FieldRow[];
  setRows: (value: Setter<FieldRow[]>) => void;
  resetRows: (count?: number) => void;
  handleCreateRow: (index: number, amount: number) => void;
  handleAddRows: (count: number) => void;
}

export interface IndexSlice {
  indexInput: string;
  currentIndexFields: IndexField[];
  indexes: IndexDefinition[];
  showFieldSuggestions: boolean;
  selectedSuggestionIndex: number;
  setIndexInput: (value: Setter<string>) => void;
  setCurrentIndexFields: (value: Setter<IndexField[]>) => void;
  setIndexes: (value: Setter<IndexDefinition[]>) => void;
  setShowFieldSuggestions: (value: Setter<boolean>) => void;
  setSelectedSuggestionIndex: (value: Setter<number>) => void;
  addFieldToIndex: (fieldName: string) => void;
  removeFieldFromIndex: (index: number) => void;
  toggleFieldDirection: (index: number) => void;
  addIndex: (unique: boolean, isPrimary: boolean, tableName: string, dbType: DatabaseType) => void;
  removeIndex: (id: string) => void;
  updateIndexName: (id: string, newName: string, dbType: DatabaseType) => void;
  updateIndexNames: (tableName: string, dbType: DatabaseType) => void;
  syncIndexFieldRename: (oldName: string, newName: string, dbType: DatabaseType) => void;
  resetIndexState: () => void;
}

export interface ForeignKeySlice {
  foreignKeys: ForeignKeyDefinition[];
  setForeignKeys: (value: Setter<ForeignKeyDefinition[]>) => void;
  addForeignKey: (foreignKey: Omit<ForeignKeyDefinition, 'id'>) => void;
  removeForeignKey: (id: string) => void;
  updateForeignKey: (id: string, updates: Partial<Omit<ForeignKeyDefinition, 'id'>>) => void;
  syncForeignKeyFieldRename: (oldName: string, newName: string) => void;
  resetForeignKeyState: () => void;
}

export interface AuthSlice {
  authInput: string;
  authObjects: string[];
  setAuthInput: (value: Setter<string>) => void;
  setAuthObjects: (value: Setter<string[]>) => void;
  addAuthObject: (value: string) => void;
  removeAuthObject: (index: number) => void;
  resetAuthState: () => void;
}

export interface ShardingSlice {
  citusShardingConfig: CitusShardingConfig;
  setCitusMode: (value: CitusTableMode) => void;
  setDistributionColumn: (value: string | undefined) => void;
  syncShardingFieldRename: (oldName: string, newName: string) => void;
  setCitusShardingConfig: (value: Setter<CitusShardingConfig>) => void;
  resetCitusSharding: () => void;
}

export interface PartitionSlice {
  mysqlPartitionConfig: MysqlPartitionConfig;
  setPartitionEnabled: (value: boolean) => void;
  setPartitionType: (value: MysqlPartitionType) => void;
  setPartitionColumns: (value: string[]) => void;
  setPartitionExpression: (value: string) => void;
  setPartitionCount: (value: number) => void;
  addPartition: (value: PartitionDefinition) => void;
  removePartition: (name: string) => void;
  updatePartition: (name: string, value: PartitionDefinition) => void;
  generateRangePartitions: (preset: 'year' | 'month' | 'day') => void;
  syncPartitionFieldRename: (oldName: string, newName: string) => void;
  setMysqlPartitionConfig: (value: Setter<MysqlPartitionConfig>) => void;
  resetPartition: () => void;
}

export interface TableOptionsSlice {
  tableMiscConfig: TableMiscConfig;
  setMiscEnabled: (value: boolean) => void;
  setEngine: (value: string) => void;
  setCharset: (value: string) => void;
  setCollation: (value: string) => void;
  setTablespace: (value: string) => void;
  setFillfactor: (value: number | undefined) => void;
  setPctfree: (value: number | undefined) => void;
  setInitrans: (value: number | undefined) => void;
  setStoredAs: (value: TableMiscConfig['storedAs']) => void;
  setExternal: (value: boolean) => void;
  setLocation: (value: string) => void;
  setHivePartitionConfig: (value: Setter<HivePartitionConfig>) => void;
  setTableMiscConfig: (value: Setter<TableMiscConfig>) => void;
  resetTableMiscConfig: () => void;
}

export type EditorStoreState = AppSlice &
  FieldSlice &
  IndexSlice &
  ForeignKeySlice &
  AuthSlice &
  ShardingSlice &
  PartitionSlice &
  TableOptionsSlice & {
    handleRemoveRow: (index: number, amount: number) => void;
    replaceDocument: (state: PersistedState) => void;
  };

export type EditorSetState = StoreApi<EditorStoreState>['setState'];
export type EditorGetState = StoreApi<EditorStoreState>['getState'];
