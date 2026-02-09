import { create } from 'zustand';
import type { DatabaseType } from '@/types';

type CoreDialogKey = 'save' | 'rename' | 'delete' | 'loadConfirm';

type CoreDialogState = Record<CoreDialogKey, boolean>;

function createInitialDialogs(): CoreDialogState {
  return {
    save: false,
    rename: false,
    delete: false,
    loadConfirm: false,
  };
}

interface AppStoreState {
  tableName: string;
  tableComment: string;
  dbType: DatabaseType;
  addCount: number;
  fieldTableFreezeEnabled: boolean;
  fieldTableFreezeColumns: number;
  activeTab: string;
  savedTablesDrawerOpen: boolean;
  dialogs: CoreDialogState;

  setTableName: (tableName: string) => void;
  setTableComment: (tableComment: string) => void;
  setDbType: (dbType: DatabaseType) => void;
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
}

export const useAppStore = create<AppStoreState>((set) => ({
  tableName: '',
  tableComment: '',
  dbType: 'mysql',
  addCount: 10,
  fieldTableFreezeEnabled: true,
  fieldTableFreezeColumns: 3,
  activeTab: 'fields',
  savedTablesDrawerOpen: false,
  dialogs: createInitialDialogs(),

  setTableName: (tableName) => set({ tableName }),
  setTableComment: (tableComment) => set({ tableComment }),
  setDbType: (dbType) => set({ dbType }),
  setAddCount: (addCount) => set({ addCount }),
  setFieldTableFreezeEnabled: (fieldTableFreezeEnabled) =>
    set({ fieldTableFreezeEnabled }),
  setFieldTableFreezeColumns: (fieldTableFreezeColumns) =>
    set({ fieldTableFreezeColumns }),
  setActiveTab: (activeTab) => set({ activeTab }),
  resetTableConfig: () =>
    set({
      tableName: '',
      tableComment: '',
      dbType: 'mysql',
    }),
  resetTableViewConfig: () =>
    set({
      addCount: 10,
      fieldTableFreezeEnabled: true,
      fieldTableFreezeColumns: 3,
      activeTab: 'fields',
    }),

  setSavedTablesDrawerOpen: (savedTablesDrawerOpen) =>
    set({ savedTablesDrawerOpen }),
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
}));
