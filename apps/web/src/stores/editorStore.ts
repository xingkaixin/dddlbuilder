import { create } from 'zustand';
import { createAppSlice } from './appStore';
import { createAuthSlice } from './authStore';
import { toEditorDocumentState } from './editorDocumentCodec';
import { createFieldSlice } from './fieldStore';
import { createForeignKeySlice } from './foreignKeyStore';
import { createIndexSlice } from './indexStore';
import { createPartitionSlice } from './partitionStore';
import { createShardingSlice } from './shardingStore';
import { createTableOptionsSlice } from './tableOptionsStore';
import type { EditorStoreState } from './editorStoreTypes';
import { removeFieldsFromDocument } from './editorDocumentMutations';
import { createEmptyRow } from '@/utils/helpers';
import { resolveActiveTab } from '@/utils/tabUtils';

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  ...createAppSlice(set),
  ...createFieldSlice(set),
  ...createIndexSlice(set),
  ...createForeignKeySlice(set),
  ...createAuthSlice(set, get),
  ...createShardingSlice(set),
  ...createPartitionSlice(set),
  ...createTableOptionsSlice(set),
  resetDocument: () => {
    const initial = useEditorStore.getInitialState();
    set({ ...initial, rows: initial.rows.map(() => createEmptyRow()) });
  },
  handleRemoveRow: (index, amount) =>
    set((state) =>
      removeFieldsFromDocument(state, (_, rowIndex) => {
        return rowIndex >= index && rowIndex < index + amount;
      }),
    ),
  replaceDocument: (state) =>
    set((current) => {
      const document = toEditorDocumentState(state);
      return {
        ...document,
        activeTab: resolveActiveTab(current.activeTab, {
          objectType: document.objectType,
          dbType: document.dbType,
        }),
      };
    }),
}));
