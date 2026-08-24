import {
  DEFAULT_EDITOR_SESSION_STATE,
  normalizeAddCount,
  normalizeFreezeColumns,
} from '@ddlbuilder/shared-types';
import type { AppSlice, EditorSetState } from './editorStoreTypes';

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

  setSchemaName: (schemaName) => set({ schemaName }),
  setTableName: (tableName) => set({ tableName }),
  setTableComment: (tableComment) => set({ tableComment }),
  setObjectType: (objectType) => set({ objectType }),
  setViewDefinition: (viewDefinition) => set({ viewDefinition }),
  setViewCreateOrReplace: (viewCreateOrReplace) => set({ viewCreateOrReplace }),
  setDbType: (dbType) => set({ dbType }),
  setSqlFormatMode: (sqlFormatMode) => set({ sqlFormatMode }),
  setAddCount: (addCount) => set({ addCount: normalizeAddCount(addCount) }),
  setFieldTableFreezeEnabled: (fieldTableFreezeEnabled) => set({ fieldTableFreezeEnabled }),
  setFieldTableFreezeColumns: (fieldTableFreezeColumns) =>
    set({ fieldTableFreezeColumns: normalizeFreezeColumns(fieldTableFreezeColumns) }),
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
});
