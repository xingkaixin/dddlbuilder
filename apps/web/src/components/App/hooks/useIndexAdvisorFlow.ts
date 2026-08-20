import { useCallback, useMemo, useState } from 'react';
import type {
  AIIndexAdvisorRecommendation,
  DatabaseType,
  IndexDefinition,
  IndexField,
  NormalizedField,
} from '@ddlbuilder/shared-types';
import { useAIIndexAdvisor } from '@/hooks/useAIIndexAdvisor';
import { useToast } from '@/hooks/useToast';
import { buildIndexName, getIndexNameMaxLength } from '@/utils/indexNameUtils';
import { useTranslation } from 'react-i18next';

interface UseIndexAdvisorFlowParams {
  dbType: DatabaseType;
  schemaName: string;
  tableName: string;
  tableComment: string;
  fields: NormalizedField[];
  indexes: IndexDefinition[];
  setIndexes: (
    indexes: IndexDefinition[] | ((current: IndexDefinition[]) => IndexDefinition[]),
  ) => void;
  setActiveTab: (tab: string) => void;
}

const hasSameIndexFields = (left: IndexField[], right: IndexField[]) =>
  left.length === right.length &&
  left.every(
    (field, index) =>
      field.name.trim().toLowerCase() === right[index]?.name.trim().toLowerCase() &&
      field.direction === right[index]?.direction,
  );

export const buildSuggestedIndexQuery = (
  schemaName: string,
  tableName: string,
  fields: { name: string }[],
) => {
  const table = tableName.trim();
  if (!table || fields.length === 0) return '';

  const qualifiedTable = schemaName.trim() ? `${schemaName.trim()}.${table}` : table;
  const selectFields = fields.slice(0, Math.min(fields.length, 6)).map((field) => field.name);
  const filterField =
    fields.find((field) => /(^|_)(tenant|user|account|org)_?id$/i.test(field.name)) ?? fields[0];
  const orderField = fields.find((field) =>
    /(^|_)(created|updated)_?(at|time)$|(^|_)id$/i.test(field.name),
  );
  const orderClause = orderField ? `\nORDER BY ${orderField.name} DESC` : '';

  return `SELECT ${selectFields.join(', ')}\nFROM ${qualifiedTable}\nWHERE ${filterField.name} = ?${orderClause}\nLIMIT 20;`;
};

export function useIndexAdvisorFlow({
  dbType,
  schemaName,
  tableName,
  tableComment,
  fields,
  indexes,
  setIndexes,
  setActiveTab,
}: UseIndexAdvisorFlowParams) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isLoading, result, error, analyzeIndexes, clearAdvice } = useAIIndexAdvisor();
  const [open, setOpen] = useState(false);

  const blockingMessage = useMemo(() => {
    if (!tableName.trim()) return t('aiIndexAdvisor.tableNameRequired');
    if (fields.length === 0) return t('aiIndexAdvisor.schemaRequired');
    return null;
  }, [fields.length, t, tableName]);

  const suggestedQuery = useMemo(
    () => buildSuggestedIndexQuery(schemaName, tableName, fields),
    [fields, schemaName, tableName],
  );

  const setDialogOpen = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) clearAdvice();
    },
    [clearAdvice],
  );

  const analyze = useCallback(
    (queryPatterns: string) => {
      void (async () => {
        try {
          if (blockingMessage) {
            showToast(blockingMessage);
            return;
          }

          await analyzeIndexes({
            dbType,
            schemaName,
            tableName: tableName.trim(),
            tableComment,
            fields: fields.map((field) => ({
              fieldName: field.name,
              fieldType: field.type,
              fieldComment: field.comment,
              nullable: field.nullable,
            })),
            indexes: indexes.map((index) => ({
              name: index.name,
              fields: index.fields,
              unique: index.unique,
              isPrimary: index.isPrimary,
            })),
            queryPatterns,
          });
        } catch (caught) {
          showToast((caught as Error).message || t('services.generationFailed'));
        }
      })();
    },
    [
      analyzeIndexes,
      blockingMessage,
      dbType,
      fields,
      indexes,
      schemaName,
      showToast,
      t,
      tableComment,
      tableName,
    ],
  );

  const applyRecommendation = useCallback(
    (recommendation: AIIndexAdvisorRecommendation) => {
      if (!recommendation.index) return;

      const availableFieldNames = new Set(fields.map((field) => field.name));
      const recommendedFields = recommendation.index.fields.filter((field) =>
        availableFieldNames.has(field.name),
      );
      if (recommendedFields.length === 0) {
        showToast(t('aiIndexAdvisor.schemaRequired'));
        return;
      }

      if (indexes.some((index) => hasSameIndexFields(index.fields, recommendedFields))) {
        showToast(t('aiIndexAdvisor.indexExists'));
        return;
      }

      const nextIndex: IndexDefinition = {
        id: `${Date.now()}_${recommendation.id}`,
        name: buildIndexName(
          recommendation.index.unique ? 'uk' : 'idx',
          tableName.trim() || 'current_table',
          recommendedFields.map((field) => field.name),
          getIndexNameMaxLength(dbType),
        ),
        fields: recommendedFields,
        unique: recommendation.index.unique,
        isPrimary: false,
      };

      setIndexes((current) => [...current, nextIndex]);
      setActiveTab('indexes');
      showToast(t('aiIndexAdvisor.indexApplied'));
    },
    [dbType, fields, indexes, setActiveTab, setIndexes, showToast, t, tableName],
  );

  return {
    open,
    setDialogOpen,
    openDialog: () => setOpen(true),
    isLoading,
    result,
    error,
    suggestedQuery,
    blockingMessage,
    analyze,
    applyRecommendation,
  };
}
