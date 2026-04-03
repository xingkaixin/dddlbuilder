import { create } from 'zustand';
import type { DatabaseType, SqlFormatMode } from '@/types';

type CoreDialogKey = 'save' | 'rename' | 'delete' | 'loadConfirm';

type CoreDialogState = Record<CoreDialogKey, boolean>;

interface VersionHistoryTarget {
  normalizedName: string;
  name: string;
}

function createInitialDialogs(): CoreDialogState {
  return {
    save: false,
    rename: false,
    delete: false,
    loadConfirm: false,
  };
}

interface AppStoreState {
  schemaName: string;
  tableName: string;
  tableComment: string;
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
  loadedTableNormalizedName: string | null;
  loadedTableName: string | null;
  loadedTableSignature: string | null;
  isDiffDialogOpen: boolean;
  isVersionHistoryOpen: boolean;
  versionHistoryTarget: VersionHistoryTarget | null;
  isReviewHistoryOpen: boolean;
  isStorageEstimatorOpen: boolean;
  isAIGenerateDialogOpen: boolean;

  setSchemaName: (schemaName: string) => void;
  setTableName: (tableName: string) => void;
  setTableComment: (tableComment: string) => void;
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
  setIsLoadConfirmOpen: (open: boolean) => void;
  setIsClearDialogOpen: (open: boolean) => void;
  setShowFireworks: (show: boolean) => void;
  setLoadedTableNormalizedName: (name: string | null) => void;
  setLoadedTableName: (name: string | null) => void;
  setLoadedTableSignature: (signature: string | null) => void;
  setIsDiffDialogOpen: (open: boolean) => void;
  setIsVersionHistoryOpen: (open: boolean) => void;
  setVersionHistoryTarget: (target: VersionHistoryTarget | null) => void;
  setIsReviewHistoryOpen: (open: boolean) => void;
  setIsStorageEstimatorOpen: (open: boolean) => void;
  setIsAIGenerateDialogOpen: (open: boolean) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  schemaName: '',
  tableName: '',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  addCount: 10,
  fieldTableFreezeEnabled: true,
  fieldTableFreezeColumns: 3,
  activeTab: 'fields',
  savedTablesDrawerOpen: false,
  dialogs: createInitialDialogs(),
  isClearDialogOpen: false,
  showFireworks: false,
  loadedTableNormalizedName: null,
  loadedTableName: null,
  loadedTableSignature: null,
  isDiffDialogOpen: false,
  isVersionHistoryOpen: false,
  versionHistoryTarget: null,
  isReviewHistoryOpen: false,
  isStorageEstimatorOpen: false,
  isAIGenerateDialogOpen: false,

  setSchemaName: (schemaName) => set({ schemaName }),
  setTableName: (tableName) => set({ tableName }),
  setTableComment: (tableComment) => set({ tableComment }),
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
      dbType: 'mysql',
      sqlFormatMode: 'compact',
    }),
  resetTableViewConfig: () =>
    set({
      addCount: 10,
      fieldTableFreezeEnabled: true,
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
  setIsLoadConfirmOpen: (open) =>
    set((state) => ({
      dialogs: { ...state.dialogs, loadConfirm: open },
    })),
  setIsClearDialogOpen: (isClearDialogOpen) => set({ isClearDialogOpen }),
  setShowFireworks: (showFireworks) => set({ showFireworks }),
  setLoadedTableNormalizedName: (loadedTableNormalizedName) => set({ loadedTableNormalizedName }),
  setLoadedTableName: (loadedTableName) => set({ loadedTableName }),
  setLoadedTableSignature: (loadedTableSignature) => set({ loadedTableSignature }),
  setIsDiffDialogOpen: (isDiffDialogOpen) => set({ isDiffDialogOpen }),
  setIsVersionHistoryOpen: (isVersionHistoryOpen) => set({ isVersionHistoryOpen }),
  setVersionHistoryTarget: (versionHistoryTarget) => set({ versionHistoryTarget }),
  setIsReviewHistoryOpen: (isReviewHistoryOpen) => set({ isReviewHistoryOpen }),
  setIsStorageEstimatorOpen: (isStorageEstimatorOpen) => set({ isStorageEstimatorOpen }),
  setIsAIGenerateDialogOpen: (isAIGenerateDialogOpen) => set({ isAIGenerateDialogOpen }),
}));
