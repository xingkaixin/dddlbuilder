import { create } from 'zustand';
import type { DatabaseType, IndexDefinition, IndexField } from '@/types';
import { buildPrimaryKeyName } from '@/utils/primaryKeyNaming';
import {
  isSameIdentifierToken,
  replaceIdentifierToken,
} from '@/utils/fieldRenameUtils';
import {
  MAX_INDEX_NAME_LENGTH,
  ORACLE_INDEX_NAME_LENGTH,
  buildIndexName,
  truncateIndexName,
} from '@/utils/indexNameUtils';

function getIndexNameMaxLength(dbType: DatabaseType): number {
  return dbType === 'oracle' ? ORACLE_INDEX_NAME_LENGTH : MAX_INDEX_NAME_LENGTH;
}

interface IndexStoreState {
  indexInput: string;
  currentIndexFields: IndexField[];
  indexes: IndexDefinition[];
  showFieldSuggestions: boolean;
  selectedSuggestionIndex: number;

  setIndexInput: (value: string | ((prev: string) => string)) => void;
  setCurrentIndexFields: (
    fields: IndexField[] | ((prev: IndexField[]) => IndexField[]),
  ) => void;
  setIndexes: (
    indexes:
      | IndexDefinition[]
      | ((prev: IndexDefinition[]) => IndexDefinition[]),
  ) => void;
  setShowFieldSuggestions: (
    show: boolean | ((prev: boolean) => boolean),
  ) => void;
  setSelectedSuggestionIndex: (
    index: number | ((prev: number) => number),
  ) => void;

  initializeIndexState: (persistedState?: {
    indexInput?: string;
    currentIndexFields?: IndexField[];
    indexes?: IndexDefinition[];
  }) => void;
  addFieldToIndex: (fieldName: string) => void;
  removeFieldFromIndex: (index: number) => void;
  toggleFieldDirection: (index: number) => void;
  addIndex: (
    unique: boolean,
    isPrimary: boolean,
    tableName: string,
    dbType: DatabaseType,
  ) => void;
  removeIndex: (id: string) => void;
  updateIndexName: (id: string, newName: string, dbType: DatabaseType) => void;
  updateIndexNames: (tableName: string, dbType: DatabaseType) => void;
  syncFieldRename: (
    oldFieldName: string,
    newFieldName: string,
    dbType: DatabaseType,
  ) => void;
  resetIndexState: () => void;
}

export const useIndexStore = create<IndexStoreState>((set, get) => ({
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
      currentIndexFields:
        typeof fields === 'function'
          ? fields(state.currentIndexFields)
          : fields,
    })),
  setIndexes: (indexes) =>
    set((state) => ({
      indexes: typeof indexes === 'function' ? indexes(state.indexes) : indexes,
    })),
  setShowFieldSuggestions: (show) =>
    set((state) => ({
      showFieldSuggestions:
        typeof show === 'function' ? show(state.showFieldSuggestions) : show,
    })),
  setSelectedSuggestionIndex: (index) =>
    set((state) => ({
      selectedSuggestionIndex:
        typeof index === 'function'
          ? index(state.selectedSuggestionIndex)
          : index,
    })),

  initializeIndexState: (persistedState) => {
    if (!persistedState) {
      return;
    }

    set({
      indexInput: persistedState.indexInput ?? '',
      currentIndexFields: persistedState.currentIndexFields ?? [],
      indexes: persistedState.indexes ?? [],
    });
  },

  addFieldToIndex: (fieldName) => {
    set((state) => ({
      currentIndexFields: [
        ...state.currentIndexFields,
        { name: fieldName, direction: 'ASC' },
      ],
      indexInput: '',
      showFieldSuggestions: false,
      selectedSuggestionIndex: 0,
    }));
  },

  removeFieldFromIndex: (index) => {
    set((state) => ({
      currentIndexFields: state.currentIndexFields.filter(
        (_, i) => i !== index,
      ),
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
      ? buildPrimaryKeyName(tableName)
      : buildIndexName(
          unique ? 'uk' : 'idx',
          tableName,
          currentIndexFields.map((field) => field.name),
          indexNameMaxLength,
        );

    const newIndex: IndexDefinition = {
      id: Date.now().toString(),
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

  updateIndexNames: (tableName, dbType) => {
    if (!tableName) return;

    const indexNameMaxLength = getIndexNameMaxLength(dbType);

    set((state) => ({
      indexes: state.indexes.map((index) => {
        if (index.isPrimary) {
          return {
            ...index,
            name: buildPrimaryKeyName(tableName),
          };
        }

        const prefix = index.unique ? 'uk' : 'idx';
        return {
          ...index,
          name: buildIndexName(
            prefix,
            tableName,
            index.fields.map((field) => field.name),
            indexNameMaxLength,
          ),
        };
      }),
    }));
  },

  syncFieldRename: (oldFieldName, newFieldName, dbType) => {
    if (!oldFieldName || !newFieldName || oldFieldName === newFieldName) {
      return;
    }

    const indexNameMaxLength = getIndexNameMaxLength(dbType);

    set((state) => ({
      currentIndexFields: state.currentIndexFields.map((field) =>
        isSameIdentifierToken(field.name, oldFieldName)
          ? { ...field, name: newFieldName }
          : field,
      ),
      indexes: state.indexes.map((index) => {
        const fieldsChanged = index.fields.some((field) =>
          isSameIdentifierToken(field.name, oldFieldName),
        );

        if (!fieldsChanged) {
          return index;
        }

        const nextNameRaw = replaceIdentifierToken(
          index.name,
          oldFieldName,
          newFieldName,
        );

        return {
          ...index,
          fields: index.fields.map((field) =>
            isSameIdentifierToken(field.name, oldFieldName)
              ? { ...field, name: newFieldName }
              : field,
          ),
          name:
            nextNameRaw === index.name
              ? index.name
              : truncateIndexName(nextNameRaw, indexNameMaxLength),
        };
      }),
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
}));
