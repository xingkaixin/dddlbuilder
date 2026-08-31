import { useCallback, useMemo, useState } from 'react';
import {
  createEntityId,
  type AIIndexAdvisorRecommendation,
  type DatabaseType,
  type IndexDefinition,
  type IndexField,
  type NormalizedField,
} from '@ddlbuilder/shared-types';
import { useAIIndexAdvisor } from '@/hooks/useAIIndexAdvisor';
import { useToast } from '@/hooks/useToast';
import {
  buildIndexName,
  getIdentifierNameMaxLength as getIndexNameMaxLength,
} from '@ddlbuilder/ddl-core';
import { insertIndexDefinition } from '@/stores/indexDefinitionMutations';
import { buildNormalizedFields, useEditorStore } from '@/stores';
import { useTranslation } from 'react-i18next';

interface UseIndexAdvisorFlowParams {
  dbType: DatabaseType;
  schemaName: string;
  tableName: string;
  tableComment: string;
  fields: NormalizedField[];
  indexes: IndexDefinition[];
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
              unique: index.kind !== 'index',
              isPrimary: index.kind === 'primary',
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
      const recommendedIndex = recommendation.index;
      if (!recommendedIndex) return;

      const current = useEditorStore.getState();
      const availableFieldNames = new Set(
        buildNormalizedFields(current.rows).map((field) => field.name),
      );
      const recommendedFields = recommendedIndex.fields;
      if (
        recommendedFields.length === 0 ||
        recommendedFields.some((field) => !availableFieldNames.has(field.name))
      ) {
        showToast(t('aiIndexAdvisor.invalidIndexFields'));
        return;
      }

      if (
        current.indexes.some(
          (index) =>
            hasSameIndexFields(index.fields, recommendedFields) &&
            (!recommendedIndex.unique || index.kind !== 'index'),
        )
      ) {
        showToast(t('aiIndexAdvisor.indexExists'));
        return;
      }

      const nextIndex: IndexDefinition = {
        id: createEntityId(),
        name: buildIndexName(
          recommendedIndex.unique ? 'uk' : 'idx',
          current.tableName.trim() || 'current_table',
          recommendedFields.map((field) => field.name),
          getIndexNameMaxLength(current.dbType),
        ),
        fields: recommendedFields,
        kind: recommendedIndex.unique ? 'unique_index' : 'index',
      };

      const writeResult = insertIndexDefinition(current.indexes, nextIndex);
      if (!writeResult.ok) {
        showToast(t('indexPanel.duplicateName'));
        return;
      }

      current.setIndexes(writeResult.indexes);
      current.setActiveTab('indexes');
      showToast(t('aiIndexAdvisor.indexApplied'));
    },
    [showToast, t],
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
