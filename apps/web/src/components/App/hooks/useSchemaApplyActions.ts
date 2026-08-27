import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';
import { createEntityId, type DatabaseType, type PersistedState } from '@ddlbuilder/shared-types';
import type {
  DDLReviewResult as ReviewResult,
  DDLReviewStructuredSuggestion as StructuredSuggestion,
} from '@ddlbuilder/shared-types/ddl-review';
import type { GeneratedTableSchema } from '@/hooks/useAIGenerateTable';
import { buildPersistedStateFromAISchema } from '@/utils/aiSchemaChanges';
import { convertParsedResultToPersistedState } from '@/utils/convertParsedResultToPersistedState';
import { preserveImportedFieldIds } from '@/utils/importedFieldIdentity';
import { sanitizeIndexesForPersist } from '@/utils/indexUtils';
import type { BuilderTab } from '@/utils/tabUtils';
import { removeFieldsFromDocument } from '@/stores/editorDocumentMutations';
import { validateIndexFields } from '@/stores/editorDocumentValidation';

interface UseSchemaApplyActionsParams {
  currentState: PersistedState;
  reviewResult: ReviewResult | null;
  setReviewResult: (result: ReviewResult | null, state: PersistedState) => void;
  replaceCurrentState: (state: PersistedState) => void;
  openGeneratedState: (state: PersistedState) => void;
  setActiveTab: (value: BuilderTab) => void;
  triggerIndexAnimation: (indexId: string, mode: 'add' | 'remove') => void;
  triggerFieldTableHighlight: (rowIndex: number) => void;
  showToast: (message: string) => void;
}

const suggestionTab = (suggestion: StructuredSuggestion): BuilderTab | null => {
  switch (suggestion.type) {
    case 'add_index':
    case 'remove_index':
      return 'indexes';
    case 'add_field':
    case 'modify_field':
    case 'remove_field':
      return 'fields';
    case 'performance_warning':
    case 'general':
      return null;
  }
};

export function useSchemaApplyActions({
  currentState,
  reviewResult,
  setReviewResult,
  replaceCurrentState,
  openGeneratedState,
  setActiveTab,
  triggerIndexAnimation,
  triggerFieldTableHighlight,
  showToast,
}: UseSchemaApplyActionsParams) {
  const currentStateRef = useRef(currentState);
  const reviewResultRef = useRef(reviewResult);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useLayoutEffect(() => {
    currentStateRef.current = currentState;
    reviewResultRef.current = reviewResult;
  }, [currentState, reviewResult]);
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  const scheduleReviewAction = useCallback((action: () => void, delay: number) => {
    const state = currentStateRef.current;
    const review = reviewResultRef.current;
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      if (currentStateRef.current !== state || reviewResultRef.current !== review) return;
      action();
    }, delay);
    timers.current.add(timer);
  }, []);

  const replaceLatestState = useCallback(
    (update: (state: PersistedState) => PersistedState) => {
      const nextState = update(currentStateRef.current);
      currentStateRef.current = nextState;
      replaceCurrentState(nextState);
    },
    [replaceCurrentState],
  );

  const markSuggestionApplied = useCallback(
    (suggestion: StructuredSuggestion) => {
      const review = reviewResultRef.current;
      if (!review) return;
      const suggestions = review.suggestions.map((item) =>
        typeof item !== 'string' && item.id === suggestion.id ? { ...item, applied: true } : item,
      );
      const nextReview = { ...review, suggestions };
      reviewResultRef.current = nextReview;
      setReviewResult(nextReview, currentStateRef.current);
      showToast(`已应用建议：${suggestion.description}`);
    },
    [setReviewResult, showToast],
  );

  const handleApplySuggestion = useCallback(
    (suggestion: StructuredSuggestion) => {
      const currentSuggestion = reviewResultRef.current?.suggestions.find(
        (item) => typeof item !== 'string' && item.id === suggestion.id,
      );
      if (!currentSuggestion || typeof currentSuggestion === 'string' || currentSuggestion.applied)
        return;

      const activeTab = suggestionTab(suggestion);
      if (activeTab) setActiveTab(activeTab);

      switch (suggestion.type) {
        case 'add_field': {
          const rowIndex = currentStateRef.current.rows.length;
          replaceLatestState((state) => ({
            ...state,
            rows: [
              ...state.rows,
              {
                id: createEntityId(),
                fieldName: suggestion.field.fieldName,
                fieldType: suggestion.field.fieldType,
                fieldComment: suggestion.field.fieldComment || '',
                nullable: suggestion.field.nullable ?? true,
                defaultKind: suggestion.field.defaultKind ?? 'none',
                defaultValue: suggestion.field.defaultValue || '',
                onUpdate: suggestion.field.onUpdate ?? 'none',
              },
            ],
          }));
          triggerFieldTableHighlight(rowIndex);
          break;
        }
        case 'modify_field': {
          const { fieldName, changes } = suggestion.fieldModification;
          const rowIndex = currentStateRef.current.rows.findIndex(
            (row) => row.fieldName === fieldName,
          );
          if (rowIndex < 0) {
            showToast(`未找到字段 "${fieldName}"，无法应用修改`);
            return;
          }
          replaceLatestState((state) => ({
            ...state,
            rows: state.rows.map((row, index) =>
              index === rowIndex ? { ...row, ...changes } : row,
            ),
          }));
          triggerFieldTableHighlight(rowIndex);
          break;
        }
        case 'remove_field': {
          const rowIndex = currentStateRef.current.rows.findIndex(
            (row) => row.fieldName === suggestion.fieldName,
          );
          if (rowIndex < 0) {
            showToast(`未找到字段 "${suggestion.fieldName}"，无法删除`);
            return;
          }
          triggerFieldTableHighlight(rowIndex);
          scheduleReviewAction(() => {
            replaceLatestState((state) =>
              removeFieldsFromDocument(state, (row) => row.fieldName === suggestion.fieldName),
            );
            markSuggestionApplied(suggestion);
          }, 500);
          return;
        }
        case 'add_index': {
          const indexId = createEntityId();
          const nextState: PersistedState = {
            ...currentStateRef.current,
            indexes: sanitizeIndexesForPersist([
              ...currentStateRef.current.indexes,
              {
                id: indexId,
                name: suggestion.index.name,
                fields: suggestion.index.fields,
                unique: suggestion.index.unique === true,
              },
            ]),
          };
          try {
            validateIndexFields(nextState);
          } catch (error) {
            showToast(`无法应用建议：${error instanceof Error ? error.message : String(error)}`);
            return;
          }
          replaceLatestState(() => nextState);
          markSuggestionApplied(suggestion);
          scheduleReviewAction(() => triggerIndexAnimation(indexId, 'add'), 50);
          return;
        }
        case 'remove_index': {
          const targetIndex = currentStateRef.current.indexes.find(
            (index) => index.name === suggestion.indexName,
          );
          if (!targetIndex) {
            showToast(`未找到索引 "${suggestion.indexName}"，无法删除`);
            return;
          }
          triggerIndexAnimation(targetIndex.id, 'remove');
          scheduleReviewAction(() => {
            replaceLatestState((state) => ({
              ...state,
              indexes: state.indexes.filter((index) => index.name !== suggestion.indexName),
            }));
            markSuggestionApplied(suggestion);
          }, 500);
          return;
        }
        case 'performance_warning':
        case 'general':
          showToast('该类型建议不支持自动应用，请手动调整');
          return;
      }

      markSuggestionApplied(suggestion);
    },
    [
      markSuggestionApplied,
      replaceLatestState,
      scheduleReviewAction,
      setActiveTab,
      showToast,
      triggerFieldTableHighlight,
      triggerIndexAnimation,
    ],
  );

  const handleImport = useCallback(
    (result: ParsedResult, importDbType: DatabaseType) => {
      replaceLatestState((state) =>
        preserveImportedFieldIds(state, convertParsedResultToPersistedState(result, importDbType)),
      );
    },
    [replaceLatestState],
  );

  const handleApplyAIGeneratedSchema = useCallback(
    (schema: GeneratedTableSchema) => {
      openGeneratedState(
        buildPersistedStateFromAISchema(schema, {
          dbType: currentState.dbType,
          sqlFormatMode: currentState.sqlFormatMode,
        }),
      );
      showToast('大师建表工坊的表结构已应用');
    },
    [currentState.dbType, currentState.sqlFormatMode, openGeneratedState, showToast],
  );

  return {
    handleApplySuggestion,
    handleImport,
    handleApplyAIGeneratedSchema,
  };
}
