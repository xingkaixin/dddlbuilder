import type { ForeignKeyDefinition } from '@ddlbuilder/shared-types';
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
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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

  syncForeignKeyFieldRename: (oldFieldName, newFieldName) => {
    if (!oldFieldName || !newFieldName || oldFieldName === newFieldName) {
      return;
    }
    set((state) => ({
      foreignKeys: state.foreignKeys.map((fk) => {
        const fieldsChanged = fk.fields.some((f) => f === oldFieldName);
        if (!fieldsChanged) return fk;
        return {
          ...fk,
          fields: fk.fields.map((f) => (f === oldFieldName ? newFieldName : f)),
        };
      }),
    }));
  },

  resetForeignKeyState: () => {
    set({ foreignKeys: [] });
  },
});
