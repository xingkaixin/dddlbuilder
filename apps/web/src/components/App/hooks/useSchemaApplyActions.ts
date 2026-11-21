import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';
import { createEntityId, type DatabaseType, type PersistedState } from '@ddlbuilder/shared-types';
import type {
  DDLReviewResult as ReviewResult,
  DDLReviewStructuredSuggestion as StructuredSuggestion,
} from '@ddlbuilder/shared-types/ddl-review';
import type { GeneratedTableSchema } from '@ddlbuilder/shared-types/ai-generate';
import { buildPersistedStateFromAISchema } from '@/utils/aiSchemaChanges';
import { convertParsedResultToPersistedState } from '@/utils/convertParsedResultToPersistedState';
import { preserveImportedFieldIds } from '@/utils/importedFieldIdentity';
import { sanitizeIndexesForPersist } from '@/utils/indexUtils';
import type { BuilderTab } from '@/utils/tabUtils';
import { toPersistedState } from '@/stores/editorDocumentCodec';
import { removeFieldsFromDocument } from '@/stores/editorDocumentMutations';
import { validateDocumentFields } from '@/stores/editorDocumentValidation';
import { useEditorStore } from '@/stores/editorStore';
import { isStructuredSuggestion, useReviewStore } from '@/stores/reviewStore';
import { useTimers } from '@/hooks/useTimers';

interface UseSchemaApplyActionsParams {
  getCurrentDocumentKey: () => string;
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

const readCurrentState = (): PersistedState => toPersistedState(useEditorStore.getState());

const readCurrentReview = (documentKey: string): ReviewResult | null => {
  const reviewState = useReviewStore.getState();

  return reviewState.documentKey === documentKey ? reviewState.result : null;
};

export function useSchemaApplyActions({
  getCurrentDocumentKey,
  replaceCurrentState,
  openGeneratedState,
  setActiveTab,
  triggerIndexAnimation,
  triggerFieldTableHighlight,
  showToast,
}: UseSchemaApplyActionsParams) {
  const { t } = useTranslation();
  const { schedule } = useTimers();

  const scheduleReviewAction = useCallback(
    (action: () => void, delay: number) => {
      const capturedDocumentKey = getCurrentDocumentKey();
      const capturedReview = readCurrentReview(capturedDocumentKey);

      schedule(() => {
        const currentDocumentKey = getCurrentDocumentKey();

        if (
          currentDocumentKey !== capturedDocumentKey ||
          readCurrentReview(currentDocumentKey) !== capturedReview
        ) {
          return;
        }

        action();
      }, delay);
    },
    [getCurrentDocumentKey, schedule],
  );

  const replaceLatestState = useCallback(
    (update: (state: PersistedState) => PersistedState) => {
      replaceCurrentState(update(readCurrentState()));
    },
    [replaceCurrentState],
  );

  const markSuggestionApplied = useCallback(
    (previousDocumentKey: string, suggestion: StructuredSuggestion) => {
      const nextDocumentKey = getCurrentDocumentKey();

      if (
        !useReviewStore
          .getState()
          .markSuggestionApplied(previousDocumentKey, nextDocumentKey, suggestion.id)
      ) {
        return;
      }

      showToast(`已应用建议：${suggestion.description}`);
    },
    [getCurrentDocumentKey, showToast],
  );

  const handleApplySuggestion = useCallback(
    (suggestion: StructuredSuggestion) => {
      const documentKey = getCurrentDocumentKey();

      const currentSuggestion = readCurrentReview(documentKey)?.suggestions.find(
        (item): item is StructuredSuggestion =>
          isStructuredSuggestion(item) && item.id === suggestion.id,
      );

      if (!currentSuggestion || currentSuggestion.applied) return;

      const activeTab = suggestionTab(suggestion);

      if (activeTab) setActiveTab(activeTab);

      const currentState = readCurrentState();

      switch (suggestion.type) {
        case 'add_field': {
          const rowIndex = currentState.rows.length;
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

          const rowIndex = currentState.rows.findIndex((row) => row.fieldName === fieldName);

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
          const rowIndex = currentState.rows.findIndex(
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
            markSuggestionApplied(documentKey, suggestion);
          }, 500);

          return;
        }

        case 'add_index': {
          const indexId = createEntityId();

          const nextState: PersistedState = {
            ...currentState,
            indexes: sanitizeIndexesForPersist([
              ...currentState.indexes,
              {
                id: indexId,
                name: suggestion.index.name,
                fields: suggestion.index.fields,
                kind: suggestion.index.unique ? 'unique_index' : 'index',
              },
            ]),
          };

          try {
            validateDocumentFields(nextState);
          } catch (error) {
            showToast(`无法应用建议：${error instanceof Error ? error.message : String(error)}`);

            return;
          }

          replaceCurrentState(nextState);
          markSuggestionApplied(documentKey, suggestion);
          scheduleReviewAction(() => triggerIndexAnimation(indexId, 'add'), 50);

          return;
        }

        case 'remove_index': {
          const targetIndex = currentState.indexes.find(
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
            markSuggestionApplied(documentKey, suggestion);
          }, 500);

          return;
        }

        case 'performance_warning':
        case 'general':
          showToast('该类型建议不支持自动应用，请手动调整');

          return;
      }

      markSuggestionApplied(documentKey, suggestion);
    },
    [
      getCurrentDocumentKey,
      markSuggestionApplied,
      replaceCurrentState,
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
      const { dbType, sqlFormatMode } = useEditorStore.getState();

      openGeneratedState(
        buildPersistedStateFromAISchema(schema, {
          dbType,
          sqlFormatMode,
        }),
      );
      showToast(t('aiGenerate.appliedToast'));
    },
    [openGeneratedState, showToast, t],
  );

  return {
    handleApplySuggestion,
    handleImport,
    handleApplyAIGeneratedSchema,
  };
}
