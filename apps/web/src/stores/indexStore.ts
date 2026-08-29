import type { EditorSetState, IndexSlice } from './editorStoreTypes';

export const createIndexSlice = (set: EditorSetState): IndexSlice => ({
  indexes: [],
  setIndexes: (indexes) =>
    set((state) => ({
      indexes: typeof indexes === 'function' ? indexes(state.indexes) : indexes,
    })),
  removeIndex: (id) => {
    set((state) => ({
      indexes: state.indexes.filter((index) => index.id !== id),
    }));
  },

  resetIndexState: () => {
    set({ indexes: [] });
  },
});
