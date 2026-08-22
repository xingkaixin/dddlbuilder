import { create } from 'zustand';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { createAppSlice } from './appStore';
import { createAuthSlice } from './authStore';
import { createFieldSlice } from './fieldStore';
import { createForeignKeySlice } from './foreignKeyStore';
import { createIndexSlice } from './indexStore';
import { DEFAULT_PARTITION_CONFIG, createPartitionSlice } from './partitionStore';
import { DEFAULT_SHARDING_CONFIG, createShardingSlice } from './shardingStore';
import { DEFAULT_TABLE_MISC_CONFIG, createTableOptionsSlice } from './tableOptionsStore';
import type { EditorStoreState } from './editorStoreTypes';

const documentState = (state: PersistedState) => ({
  schemaName: state.schemaName ?? '',
  tableName: state.tableName ?? '',
  tableComment: state.tableComment ?? '',
  objectType: state.objectType ?? ('table' as const),
  viewDefinition: state.viewDefinition ?? '',
  viewCreateOrReplace: state.viewCreateOrReplace !== false,
  dbType: state.dbType ?? ('mysql' as const),
  sqlFormatMode: state.sqlFormatMode ?? ('compact' as const),
  addCount: state.addCount ?? 10,
  rows: state.rows,
  indexInput: state.indexInput ?? '',
  currentIndexFields: state.currentIndexFields ?? [],
  indexes: state.indexes ?? [],
  showFieldSuggestions: false,
  selectedSuggestionIndex: 0,
  foreignKeys: state.foreignKeys ?? [],
  authInput: state.authInput ?? '',
  authObjects: state.authObjects ?? [],
  citusShardingConfig: state.citusShardingConfig ?? DEFAULT_SHARDING_CONFIG,
  mysqlPartitionConfig: state.mysqlPartitionConfig ?? DEFAULT_PARTITION_CONFIG,
  tableMiscConfig: state.tableMiscConfig ?? DEFAULT_TABLE_MISC_CONFIG,
  fieldTableFreezeEnabled: state.fieldTableViewConfig?.freezeEnabled ?? false,
  fieldTableFreezeColumns: state.fieldTableViewConfig?.freezeColumns ?? 3,
});

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  ...createAppSlice(set),
  ...createFieldSlice(set),
  ...createIndexSlice(set, get),
  ...createForeignKeySlice(set),
  ...createAuthSlice(set, get),
  ...createShardingSlice(set),
  ...createPartitionSlice(set),
  ...createTableOptionsSlice(set),
  replaceDocument: (state) => set(documentState(state)),
}));
