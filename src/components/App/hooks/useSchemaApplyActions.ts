import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ParsedResult } from '@/utils/SqlParser';
import { createEmptyRow } from '@/utils/helpers';
import type {
  DatabaseType,
  FieldRow,
  IndexDefinition,
  NullableDefault,
} from '@/types';
import type { ReviewResult, StructuredSuggestion } from '@/hooks/useDDLReview';
import type { GeneratedTableSchema } from '@/hooks/useAIGenerateTable';

type AnalyticsValue = string | number | boolean | null | undefined;

interface UseSchemaApplyActionsParams {
  rows: FieldRow[];
  indexes: IndexDefinition[];
  reviewResult: ReviewResult | null;
  setRows: Dispatch<SetStateAction<FieldRow[]>>;
  setIndexes: Dispatch<SetStateAction<IndexDefinition[]>>;
  setReviewResult: (result: ReviewResult | null) => void;
  setIndexInput: (value: string) => void;
  setAuthObjects: Dispatch<SetStateAction<string[]>>;
  setAuthInput: Dispatch<SetStateAction<string>>;
  setTableName: (value: string) => void;
  setTableComment: (value: string) => void;
  setDbType: (value: DatabaseType) => void;
  setActiveTab: (value: string) => void;
  triggerIndexAnimation: (indexId: string, mode: 'add' | 'remove') => void;
  triggerFieldTableHighlight: (rowIndex: number) => void;
  showToast: (message: string) => void;
  trackEvent: (
    event: string,
    data?: Record<string, AnalyticsValue>,
  ) => Promise<void>;
}

export function useSchemaApplyActions({
  rows,
  indexes,
  reviewResult,
  setRows,
  setIndexes,
  setReviewResult,
  setIndexInput,
  setAuthObjects,
  setAuthInput,
  setTableName,
  setTableComment,
  setDbType,
  setActiveTab,
  triggerIndexAnimation,
  triggerFieldTableHighlight,
  showToast,
  trackEvent,
}: UseSchemaApplyActionsParams) {
  const handleApplySuggestion = useCallback(
    (suggestion: StructuredSuggestion) => {
      if (suggestion.applied) return;

      let appliedCount = 0;
      let newIndexId: string | null = null;

      if (
        suggestion.type === 'add_index' ||
        suggestion.type === 'remove_index'
      ) {
        setActiveTab('indexes');
      } else if (
        suggestion.type === 'add_field' ||
        suggestion.type === 'modify_field' ||
        suggestion.type === 'remove_field'
      ) {
        setActiveTab('fields');
      }

      switch (suggestion.type) {
        case 'add_field':
          if (suggestion.field) {
            const newRow: FieldRow = {
              order: rows.length + 1,
              fieldName: suggestion.field.fieldName,
              fieldType: suggestion.field.fieldType,
              fieldComment: suggestion.field.fieldComment || '',
              nullable: suggestion.field.nullable || '是',
              defaultKind: suggestion.field.defaultKind || '无',
              defaultValue: suggestion.field.defaultValue || '',
              onUpdate: suggestion.field.onUpdate || '无',
            };
            setRows((prev) => [...prev, newRow]);
            appliedCount = 1;
            triggerFieldTableHighlight(rows.length);
          }
          break;

        case 'modify_field':
          if (suggestion.fieldModification) {
            const { fieldName } = suggestion.fieldModification;
            const changes = suggestion.fieldModification.changes || {
              fieldType: suggestion.fieldModification.fieldType,
              fieldComment: suggestion.fieldModification.fieldComment,
              nullable: suggestion.fieldModification.nullable,
              defaultKind: suggestion.fieldModification.defaultKind,
              defaultValue: suggestion.fieldModification.defaultValue,
              onUpdate: suggestion.fieldModification.onUpdate,
            };
            const rowIndex = rows.findIndex(
              (row) => row.fieldName === fieldName,
            );
            if (rowIndex !== -1) {
              const filteredChanges = Object.fromEntries(
                Object.entries(changes).filter(
                  ([, value]) => value !== undefined,
                ),
              );
              setRows((prev) => {
                const updatedRows = [...prev];
                updatedRows[rowIndex] = {
                  ...updatedRows[rowIndex],
                  ...filteredChanges,
                };
                return updatedRows;
              });
              appliedCount = 1;
              triggerFieldTableHighlight(rowIndex);
            }
          }
          break;

        case 'remove_field':
          if (suggestion.fieldName) {
            const rowIndex = rows.findIndex(
              (row) => row.fieldName === suggestion.fieldName,
            );
            if (rowIndex !== -1) {
              triggerFieldTableHighlight(rowIndex);
              setTimeout(() => {
                setRows((prev) => {
                  const newRows = prev.filter(
                    (row) => row.fieldName !== suggestion.fieldName,
                  );
                  return newRows.map((row, index) => ({
                    ...row,
                    order: index + 1,
                  }));
                });
              }, 500);
              appliedCount = 1;
            }
          }
          break;

        case 'add_index':
          if (suggestion.index) {
            newIndexId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const newIndex: IndexDefinition = {
              id: newIndexId,
              name: suggestion.index.name,
              fields: suggestion.index.fields,
              unique: !!suggestion.index.unique,
            };
            setIndexes((prev) => [...prev, newIndex]);
            appliedCount = 1;
            setTimeout(() => {
              if (newIndexId) {
                triggerIndexAnimation(newIndexId, 'add');
              }
            }, 50);
          }
          break;

        case 'remove_index':
          if (suggestion.indexName) {
            const targetIndex = indexes.find(
              (index) => index.name === suggestion.indexName,
            );
            if (targetIndex) {
              triggerIndexAnimation(targetIndex.id, 'remove');
              setTimeout(() => {
                setIndexes((prev) =>
                  prev.filter((index) => index.name !== suggestion.indexName),
                );
              }, 500);
              appliedCount = 1;
            }
          }
          break;

        default:
          break;
      }

      if (appliedCount > 0 && reviewResult) {
        const newSuggestions = reviewResult.suggestions.map((item) => {
          if (typeof item !== 'string' && item.id === suggestion.id) {
            return { ...item, applied: true };
          }
          return item;
        });
        setReviewResult({ ...reviewResult, suggestions: newSuggestions });
        trackEvent('sql_suggestion_apply', {
          type: suggestion.type,
          description: suggestion.description,
        });
        showToast(`已应用建议：${suggestion.description}`);
      }
    },
    [
      rows,
      indexes,
      reviewResult,
      setRows,
      setIndexes,
      setReviewResult,
      showToast,
      trackEvent,
      triggerIndexAnimation,
      triggerFieldTableHighlight,
      setActiveTab,
    ],
  );

  const handleImport = useCallback(
    (result: ParsedResult, importDbType: DatabaseType) => {
      setTableName(result.tableName);
      setTableComment(result.tableComment);
      setDbType(importDbType);

      const newRows: FieldRow[] = result.fields.map((field, index) => {
        let uiNullable = '是';
        if (field.nullable === false) uiNullable = '否';

        let uiDefaultKind: NullableDefault = '无';
        switch (field.defaultKind) {
          case 'auto_increment':
            uiDefaultKind = '自增';
            break;
          case 'constant':
            uiDefaultKind = '常量';
            break;
          case 'current_timestamp':
            uiDefaultKind = '当前时间';
            break;
          case 'uuid':
            uiDefaultKind = 'uuid';
            break;
          default:
            uiDefaultKind = '无';
            break;
        }

        let uiOnUpdate: NullableDefault = '无';
        if (field.onUpdate === 'current_timestamp') {
          uiOnUpdate = '当前时间';
        }

        return {
          order: index + 1,
          fieldName: field.name,
          fieldType: field.type,
          fieldComment: field.comment,
          nullable: uiNullable,
          defaultKind: uiDefaultKind,
          defaultValue: field.defaultValue,
          onUpdate: uiOnUpdate,
        };
      });

      const minRows = 12;
      if (newRows.length < minRows) {
        for (let i = newRows.length; i < minRows; i += 1) {
          newRows.push(createEmptyRow(i));
        }
      }
      setRows(newRows);

      setIndexes(result.indexes);
      setIndexInput('');

      setAuthObjects(result.authObjects);
      setAuthInput('');
      trackEvent('sql_import', { dbType: importDbType });
    },
    [
      setRows,
      setIndexes,
      setAuthObjects,
      setIndexInput,
      setAuthInput,
      setTableName,
      setTableComment,
      setDbType,
      trackEvent,
    ],
  );

  const handleApplyAIGeneratedSchema = useCallback(
    (schema: GeneratedTableSchema) => {
      if (schema.tableName) {
        setTableName(schema.tableName);
      }
      if (schema.tableComment) {
        setTableComment(schema.tableComment);
      }

      if (schema.fields && schema.fields.length > 0) {
        const newRows = schema.fields.map((field, index) => ({
          order: index + 1,
          fieldName: field.fieldName,
          fieldType: field.fieldType,
          fieldComment: field.fieldComment,
          nullable: field.nullable,
          defaultKind: field.defaultKind,
          defaultValue: field.defaultValue || '',
          onUpdate: field.onUpdate || '无',
        }));
        setRows(newRows as FieldRow[]);
      }

      if (schema.indexes && schema.indexes.length > 0) {
        const newIndexes = schema.indexes.map((index, i) => ({
          id: `ai-${Date.now()}-${i}`,
          name: index.name,
          fields: index.fields,
          unique: index.unique,
          isPrimary: false,
        }));

        const pkFields = schema.fields
          ?.filter((field) => field.isPrimaryKey)
          .map((field) => ({
            name: field.fieldName,
            direction: 'ASC' as const,
          }));

        if (pkFields && pkFields.length > 0) {
          newIndexes.unshift({
            id: `pk-${Date.now()}`,
            name: 'PRIMARY',
            fields: pkFields,
            unique: true,
            isPrimary: true,
          });
        }

        setIndexes(newIndexes as IndexDefinition[]);
      }

      trackEvent('ai_generate_apply', { tableName: schema.tableName });
      showToast('AI 生成的表结构已应用');
    },
    [setTableName, setTableComment, setRows, setIndexes, trackEvent, showToast],
  );

  return {
    handleApplySuggestion,
    handleImport,
    handleApplyAIGeneratedSchema,
  };
}
