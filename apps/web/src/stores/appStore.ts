import {
  DEFAULT_EDITOR_SESSION_STATE,
  normalizeAddCount,
  normalizeFreezeColumns,
} from '@ddlbuilder/shared-types';
import type { AppSlice, EditorSetState } from './editorStoreTypes';
import { updateDocumentTable } from './editorDocumentMutations';
import { resolveActiveTab } from '@/utils/tabUtils';

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

  setSchemaName: (schemaName) => set((state) => updateDocumentTable(state, { schemaName })),
  setTableName: (tableName) => set((state) => updateDocumentTable(state, { tableName })),
  setTableComment: (tableComment) => set({ tableComment }),
  setObjectType: (objectType) =>
    set((state) => ({
      objectType,
      activeTab: resolveActiveTab(state.activeTab, { objectType, dbType: state.dbType }),
    })),
  setViewDefinition: (viewDefinition) => set({ viewDefinition }),
  setViewCreateOrReplace: (viewCreateOrReplace) => set({ viewCreateOrReplace }),
  setDbType: (dbType) =>
    set((state) => ({
      dbType,
      activeTab: resolveActiveTab(state.activeTab, { objectType: state.objectType, dbType }),
    })),
  setSqlFormatMode: (sqlFormatMode) => set({ sqlFormatMode }),
  setAddCount: (addCount) => set({ addCount: normalizeAddCount(addCount) }),
  setFieldTableFreezeEnabled: (fieldTableFreezeEnabled) => set({ fieldTableFreezeEnabled }),
  setFieldTableFreezeColumns: (fieldTableFreezeColumns) =>
    set({ fieldTableFreezeColumns: normalizeFreezeColumns(fieldTableFreezeColumns) }),
  setActiveTab: (activeTab) =>
    set((state) => ({
      activeTab: resolveActiveTab(activeTab, {
        objectType: state.objectType,
        dbType: state.dbType,
      }),
    })),
  resetTableConfig: () =>
    set((state) => ({
      schemaName: '',
      tableName: '',
      tableComment: '',
      objectType: 'table',
      viewDefinition: '',
      viewCreateOrReplace: true,
      dbType: 'mysql',
      sqlFormatMode: DEFAULT_EDITOR_SESSION_STATE.sqlFormatMode,
      activeTab: resolveActiveTab(state.activeTab, { objectType: 'table', dbType: 'mysql' }),
    })),
  resetTableViewConfig: () =>
    set({
      addCount: DEFAULT_EDITOR_SESSION_STATE.addCount,
      fieldTableFreezeEnabled: false,
      fieldTableFreezeColumns: 3,
      activeTab: 'fields',
      sqlFormatMode: DEFAULT_EDITOR_SESSION_STATE.sqlFormatMode,
    }),
});
