import { createEntityId, type ForeignKeyDefinition } from '@ddlbuilder/shared-types';
import type { EditorSetState, ForeignKeySlice } from './editorStoreTypes';

export const createForeignKeySlice = (set: EditorSetState): ForeignKeySlice => ({
  foreignKeys: [],

  setForeignKeys: (foreignKeys) =>
    set((state) => ({
      foreignKeys: typeof foreignKeys === 'function' ? foreignKeys(state.foreignKeys) : foreignKeys,
    })),

  addForeignKey: (fk) => {
    const newFk: ForeignKeyDefinition = {
      ...fk,
      id: createEntityId(),
    };
    set((state) => ({
      foreignKeys: [...state.foreignKeys, newFk],
    }));
  },

  removeForeignKey: (id) => {
    set((state) => ({
      foreignKeys: state.foreignKeys.filter((fk) => fk.id !== id),
    }));
  },

  updateForeignKey: (id, updates) => {
    set((state) => ({
      foreignKeys: state.foreignKeys.map((fk) => (fk.id === id ? { ...fk, ...updates } : fk)),
    }));
  },

  resetForeignKeyState: () => {
    set({ foreignKeys: [] });
  },
});
