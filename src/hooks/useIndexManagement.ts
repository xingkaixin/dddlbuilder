import { useState, useCallback, useMemo, useEffect } from "react";
import type { IndexField, IndexDefinition } from "@/types";

export interface UseIndexManagementReturn {
  indexInput: string;
  currentIndexFields: IndexField[];
  indexes: IndexDefinition[];
  fieldSuggestions: string[];
  showFieldSuggestions: boolean;
  selectedSuggestionIndex: number;
  setIndexInput: (value: string) => void;
  setShowFieldSuggestions: (show: boolean) => void;
  setSelectedSuggestionIndex: (index: number) => void;
  addFieldToIndex: (fieldName: string) => void;
  removeFieldFromIndex: (index: number) => void;
  toggleFieldDirection: (index: number) => void;
  addIndex: (unique: boolean, isPrimary?: boolean) => void;
  removeIndex: (id: string) => void;
  updateIndexNames: (newTableName: string) => void;
}

export function useIndexManagement(
  tableName: string,
  availableFields: string[],
  persistedState?: {
    indexInput?: string;
    currentIndexFields?: IndexField[];
    indexes?: IndexDefinition[];
  }
): UseIndexManagementReturn {
  const [indexInput, setIndexInput] = useState("");
  const [currentIndexFields, setCurrentIndexFields] = useState<IndexField[]>([]);
  const [indexes, setIndexes] = useState<IndexDefinition[]>([]);
  const [showFieldSuggestions, setShowFieldSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // Update state when persisted data becomes available
  useEffect(() => {
    if (persistedState && !initialized) {
      if (persistedState.indexInput) setIndexInput(persistedState.indexInput);
      if (persistedState.currentIndexFields) setCurrentIndexFields(persistedState.currentIndexFields);
      if (persistedState.indexes) setIndexes(persistedState.indexes);
      setInitialized(true);
    }
  }, [persistedState, initialized]);

  // Filter field suggestions based on input
  const fieldSuggestions = useMemo(() => {
    if (!indexInput.trim()) return [];
    const input = indexInput.toLowerCase().trim();
    return availableFields.filter(
      (field) =>
        field.toLowerCase().includes(input) &&
        !currentIndexFields.some((f) => f.name === field)
    );
  }, [indexInput, availableFields, currentIndexFields]);

  // Index management functions
  const addFieldToIndex = useCallback((fieldName: string) => {
    setCurrentIndexFields((prev) => [
      ...prev,
      { name: fieldName, direction: "ASC" },
    ]);
    setIndexInput("");
    setShowFieldSuggestions(false);
    setSelectedSuggestionIndex(0);
  }, []);

  const removeFieldFromIndex = useCallback((index: number) => {
    setCurrentIndexFields((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggleFieldDirection = useCallback((index: number) => {
    setCurrentIndexFields((prev) =>
      prev.map((field, i) =>
        i === index
          ? { ...field, direction: field.direction === "ASC" ? "DESC" : "ASC" }
          : field
      )
    );
  }, []);

  const addIndex = useCallback(
    (unique: boolean, isPrimary: boolean = false) => {
      if (currentIndexFields.length === 0) return;

      // Check if primary key already exists
      if (isPrimary && indexes.some((index) => index.isPrimary)) {
        return; // Prevent adding multiple primary keys
      }

      const prefix = isPrimary ? "pk" : "idx";
      const indexName =
        currentIndexFields.length === 1
          ? `${prefix}_${tableName}_${currentIndexFields[0].name}`
          : `${prefix}_${tableName}_${currentIndexFields
              .map((f) => f.name)
              .join("_")}`;

      const newIndex: IndexDefinition = {
        id: Date.now().toString(),
        name: indexName,
        fields: [...currentIndexFields],
        unique,
        isPrimary,
      };

      setIndexes((prev) => [...prev, newIndex]);
      setCurrentIndexFields([]);
      setIndexInput("");
    },
    [currentIndexFields, tableName, indexes]
  );

  const removeIndex = useCallback((id: string) => {
    setIndexes((prev) => prev.filter((index) => index.id !== id));
  }, []);

  // Generate index name based on table name and fields
  const generateIndexName = useCallback(
    (index: IndexDefinition, currentTableName: string): string => {
      if (!currentTableName) return index.name;

      const prefix = index.isPrimary ? "pk" : index.unique ? "uk" : "idx";
      return index.fields.length === 1
        ? `${prefix}_${currentTableName}_${index.fields[0].name}`
        : `${prefix}_${currentTableName}_${index.fields
            .map((f) => f.name)
            .join("_")}`;
    },
    []
  );

  // Update all index names based on new table name
  const updateIndexNames = useCallback(
    (newTableName: string) => {
      if (!newTableName) return;

      setIndexes((prevIndexes) =>
        prevIndexes.map((index) => ({
          ...index,
          name: generateIndexName(index, newTableName),
        }))
      );
    },
    [generateIndexName]
  );

  // Update index names when table name changes
  useEffect(() => {
    if (indexes.length > 0 && tableName) {
      updateIndexNames(tableName);
    }
  }, [tableName, indexes.length, updateIndexNames, generateIndexName]);

  return {
    indexInput,
    currentIndexFields,
    indexes,
    fieldSuggestions,
    showFieldSuggestions,
    selectedSuggestionIndex,
    setIndexInput,
    setShowFieldSuggestions,
    setSelectedSuggestionIndex,
    addFieldToIndex,
    removeFieldFromIndex,
    toggleFieldDirection,
    addIndex,
    removeIndex,
    updateIndexNames,
  };
}