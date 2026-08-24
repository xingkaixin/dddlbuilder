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

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  ...createAppSlice(set),
  ...createFieldSlice(set),
  ...createIndexSlice(set, get),
  ...createForeignKeySlice(set),
  ...createAuthSlice(set, get),
  ...createShardingSlice(set),
  ...createPartitionSlice(set),
  ...createTableOptionsSlice(set),
  handleRemoveRow: (index, amount) =>
    set((state) =>
      removeFieldsFromDocument(state, (_, rowIndex) => {
        return rowIndex >= index && rowIndex < index + amount;
      }),
    ),
  replaceDocument: (state) =>
    set({
      ...toEditorDocumentState(state),
      showFieldSuggestions: false,
      selectedSuggestionIndex: 0,
    }),
}));
