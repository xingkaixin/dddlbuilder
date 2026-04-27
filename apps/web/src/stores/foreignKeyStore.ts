import { create } from 'zustand';
import type { ForeignKeyDefinition } from '@ddlbuilder/shared-types';

interface ForeignKeyStoreState {
  foreignKeys: ForeignKeyDefinition[];

  setForeignKeys: (
    foreignKeys:
      | ForeignKeyDefinition[]
      | ((prev: ForeignKeyDefinition[]) => ForeignKeyDefinition[]),
  ) => void;

  initializeForeignKeyState: (persistedState?: { foreignKeys?: ForeignKeyDefinition[] }) => void;
  addForeignKey: (fk: Omit<ForeignKeyDefinition, 'id'>) => void;
  removeForeignKey: (id: string) => void;
  updateForeignKey: (id: string, updates: Partial<Omit<ForeignKeyDefinition, 'id'>>) => void;
  syncFieldRename: (oldFieldName: string, newFieldName: string) => void;
  resetForeignKeyState: () => void;
}

export const useForeignKeyStore = create<ForeignKeyStoreState>((set) => ({
  foreignKeys: [],

  setForeignKeys: (foreignKeys) =>
    set((state) => ({
      foreignKeys: typeof foreignKeys === 'function' ? foreignKeys(state.foreignKeys) : foreignKeys,
    })),

  initializeForeignKeyState: (persistedState) => {
    if (!persistedState) {
      return;
    }
    set({
      foreignKeys: persistedState.foreignKeys ?? [],
    });
  },

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

  syncFieldRename: (oldFieldName, newFieldName) => {
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
}));
