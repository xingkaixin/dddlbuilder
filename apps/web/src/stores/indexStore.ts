import { createEntityId, type IndexDefinition } from '@ddlbuilder/shared-types';
import { buildPrimaryKeyName } from '@ddlbuilder/ddl-core';
import {
  buildIndexName,
  getIdentifierNameMaxLength as getIndexNameMaxLength,
  truncateIdentifierName as truncateIndexName,
} from '@ddlbuilder/ddl-core';
import type { EditorGetState, EditorSetState, IndexSlice } from './editorStoreTypes';

export const createIndexSlice = (set: EditorSetState, get: EditorGetState): IndexSlice => ({
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  showFieldSuggestions: false,
  selectedSuggestionIndex: 0,

  setIndexInput: (value) =>
    set((state) => ({
      indexInput: typeof value === 'function' ? value(state.indexInput) : value,
    })),
  setCurrentIndexFields: (fields) =>
    set((state) => ({
      currentIndexFields: typeof fields === 'function' ? fields(state.currentIndexFields) : fields,
    })),
  setIndexes: (indexes) =>
    set((state) => ({
      indexes: typeof indexes === 'function' ? indexes(state.indexes) : indexes,
    })),
  setShowFieldSuggestions: (show) =>
    set((state) => ({
      showFieldSuggestions: typeof show === 'function' ? show(state.showFieldSuggestions) : show,
    })),
  setSelectedSuggestionIndex: (index) =>
    set((state) => ({
      selectedSuggestionIndex:
        typeof index === 'function' ? index(state.selectedSuggestionIndex) : index,
    })),

  addFieldToIndex: (fieldName) => {
    set((state) => ({
      currentIndexFields: [...state.currentIndexFields, { name: fieldName, direction: 'ASC' }],
      indexInput: '',
      showFieldSuggestions: false,
      selectedSuggestionIndex: 0,
    }));
  },

  removeFieldFromIndex: (index) => {
    set((state) => ({
      currentIndexFields: state.currentIndexFields.filter((_, i) => i !== index),
    }));
  },

  toggleFieldDirection: (index) => {
    set((state) => ({
      currentIndexFields: state.currentIndexFields.map((field, i) =>
        i === index
          ? {
              ...field,
              direction: field.direction === 'ASC' ? 'DESC' : 'ASC',
            }
          : field,
      ),
    }));
  },

  addIndex: (unique, isPrimary, tableName, dbType) => {
    const { currentIndexFields, indexes } = get();
    if (currentIndexFields.length === 0) return;

    if (isPrimary && indexes.some((index) => index.isPrimary)) {
      return;
    }

    const indexNameMaxLength = getIndexNameMaxLength(dbType);

    const indexName = isPrimary
      ? buildPrimaryKeyName(tableName, indexNameMaxLength)
      : buildIndexName(
          unique ? 'uk' : 'idx',
          tableName,
          currentIndexFields.map((field) => field.name),
          indexNameMaxLength,
        );

    const newIndex: IndexDefinition = {
      id: createEntityId(),
      name: indexName,
      fields: [...currentIndexFields],
      unique,
      isPrimary,
    };

    set((state) => ({
      indexes: [...state.indexes, newIndex],
      currentIndexFields: [],
      indexInput: '',
      showFieldSuggestions: false,
      selectedSuggestionIndex: 0,
    }));
  },

  removeIndex: (id) => {
    set((state) => ({
      indexes: state.indexes.filter((index) => index.id !== id),
    }));
  },

  updateIndexName: (id, newName, dbType) => {
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    const indexNameMaxLength = getIndexNameMaxLength(dbType);

    set((state) => ({
      indexes: state.indexes.map((index) =>
        index.id === id
          ? {
              ...index,
              name: truncateIndexName(trimmedName, indexNameMaxLength),
            }
          : index,
      ),
    }));
  },

  resetIndexState: () => {
    set({
      indexInput: '',
      currentIndexFields: [],
      indexes: [],
      showFieldSuggestions: false,
      selectedSuggestionIndex: 0,
    });
  },
});
