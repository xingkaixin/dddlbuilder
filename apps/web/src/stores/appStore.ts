import { create } from 'zustand';
import type { DatabaseType, SchemaObjectType, SqlFormatMode } from '@ddlbuilder/shared-types';

type CoreDialogKey = 'save' | 'rename' | 'delete';

type CoreDialogState = Record<CoreDialogKey, boolean>;

/** target 即开关：为 null 就是关闭状态，不再另存一个必然同步的布尔。 */
interface VersionHistoryTarget {
  normalizedName: string;
  name: string;
}

function createInitialDialogs(): CoreDialogState {
  return {
    save: false,
    rename: false,
    delete: false,
  };
}

interface AppStoreState {
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
  activeTab: string;
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

  setSchemaName: (schemaName: string) => void;
  setTableName: (tableName: string) => void;
  setTableComment: (tableComment: string) => void;
  setObjectType: (objectType: SchemaObjectType) => void;
  setViewDefinition: (definition: string) => void;
  setViewCreateOrReplace: (enabled: boolean) => void;
  setDbType: (dbType: DatabaseType) => void;
  setSqlFormatMode: (mode: SqlFormatMode) => void;
  setAddCount: (count: number) => void;
  setFieldTableFreezeEnabled: (enabled: boolean) => void;
  setFieldTableFreezeColumns: (columns: number) => void;
  setActiveTab: (tab: string) => void;
  resetTableConfig: () => void;
  resetTableViewConfig: () => void;

  setSavedTablesDrawerOpen: (open: boolean) => void;
  setIsSaveDialogOpen: (open: boolean) => void;
  setIsRenameDialogOpen: (open: boolean) => void;
  setIsDeleteDialogOpen: (open: boolean) => void;
  setIsClearDialogOpen: (open: boolean) => void;
  setShowFireworks: (show: boolean) => void;
  setIsDiffDialogOpen: (open: boolean) => void;
  setVersionHistoryTarget: (target: VersionHistoryTarget | null) => void;
  setIsReviewHistoryOpen: (open: boolean) => void;
  setIsStorageEstimatorOpen: (open: boolean) => void;
  setIsAIGenerateDialogOpen: (open: boolean) => void;
  setIsMockDataDialogOpen: (open: boolean) => void;
  setTimelinePlayerTarget: (target: VersionHistoryTarget | null) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  schemaName: '',
  tableName: '',
  tableComment: '',
  objectType: 'table',
  viewDefinition: '',
  viewCreateOrReplace: true,
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  addCount: 10,
  fieldTableFreezeEnabled: false,
  fieldTableFreezeColumns: 3,
  activeTab: 'fields',
  savedTablesDrawerOpen: false,
  dialogs: createInitialDialogs(),
  isClearDialogOpen: false,
  showFireworks: false,
  isDiffDialogOpen: false,
  versionHistoryTarget: null,
  isReviewHistoryOpen: false,
  isStorageEstimatorOpen: false,
  isAIGenerateDialogOpen: false,
  isMockDataDialogOpen: false,
  timelinePlayerTarget: null,

  setSchemaName: (schemaName) => set({ schemaName }),
  setTableName: (tableName) => set({ tableName }),
  setTableComment: (tableComment) => set({ tableComment }),
  setObjectType: (objectType) => set({ objectType }),
  setViewDefinition: (viewDefinition) => set({ viewDefinition }),
  setViewCreateOrReplace: (viewCreateOrReplace) => set({ viewCreateOrReplace }),
  setDbType: (dbType) => set({ dbType }),
  setSqlFormatMode: (sqlFormatMode) => set({ sqlFormatMode }),
  setAddCount: (addCount) => set({ addCount }),
  setFieldTableFreezeEnabled: (fieldTableFreezeEnabled) => set({ fieldTableFreezeEnabled }),
  setFieldTableFreezeColumns: (fieldTableFreezeColumns) => set({ fieldTableFreezeColumns }),
  setActiveTab: (activeTab) => set({ activeTab }),
  resetTableConfig: () =>
    set({
      schemaName: '',
      tableName: '',
      tableComment: '',
      objectType: 'table',
      viewDefinition: '',
      viewCreateOrReplace: true,
      dbType: 'mysql',
      sqlFormatMode: 'compact',
    }),
  resetTableViewConfig: () =>
    set({
      addCount: 10,
      fieldTableFreezeEnabled: false,
      fieldTableFreezeColumns: 3,
      activeTab: 'fields',
      sqlFormatMode: 'compact',
    }),

  setSavedTablesDrawerOpen: (savedTablesDrawerOpen) => set({ savedTablesDrawerOpen }),
  setIsSaveDialogOpen: (open) =>
    set((state) => ({
      dialogs: { ...state.dialogs, save: open },
    })),
  setIsRenameDialogOpen: (open) =>
    set((state) => ({
      dialogs: { ...state.dialogs, rename: open },
    })),
  setIsDeleteDialogOpen: (open) =>
    set((state) => ({
      dialogs: { ...state.dialogs, delete: open },
    })),
  setIsClearDialogOpen: (isClearDialogOpen) => set({ isClearDialogOpen }),
  setShowFireworks: (showFireworks) => set({ showFireworks }),
  setIsDiffDialogOpen: (isDiffDialogOpen) => set({ isDiffDialogOpen }),
  setVersionHistoryTarget: (versionHistoryTarget) => set({ versionHistoryTarget }),
  setIsReviewHistoryOpen: (isReviewHistoryOpen) => set({ isReviewHistoryOpen }),
  setIsStorageEstimatorOpen: (isStorageEstimatorOpen) => set({ isStorageEstimatorOpen }),
  setIsAIGenerateDialogOpen: (isAIGenerateDialogOpen) => set({ isAIGenerateDialogOpen }),
  setIsMockDataDialogOpen: (isMockDataDialogOpen) => set({ isMockDataDialogOpen }),
  setTimelinePlayerTarget: (timelinePlayerTarget) => set({ timelinePlayerTarget }),
}));
