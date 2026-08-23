import { DEFAULT_EDITOR_SESSION_STATE } from '@ddlbuilder/shared-types';
import type { AppSlice, EditorSetState } from './editorStoreTypes';

function createInitialDialogs() {
  return {
    save: false,
    rename: false,
    delete: false,
  };
}

export const createAppSlice = (set: EditorSetState): AppSlice => ({
  schemaName: '',
  tableName: '',
  tableComment: '',
  objectType: 'table',
  viewDefinition: '',
  viewCreateOrReplace: true,
  dbType: 'mysql',
  sqlFormatMode: DEFAULT_EDITOR_SESSION_STATE.sqlFormatMode,
  addCount: DEFAULT_EDITOR_SESSION_STATE.addCount,
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
      sqlFormatMode: DEFAULT_EDITOR_SESSION_STATE.sqlFormatMode,
    }),
  resetTableViewConfig: () =>
    set({
      addCount: DEFAULT_EDITOR_SESSION_STATE.addCount,
      fieldTableFreezeEnabled: false,
      fieldTableFreezeColumns: 3,
      activeTab: 'fields',
      sqlFormatMode: DEFAULT_EDITOR_SESSION_STATE.sqlFormatMode,
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
});
