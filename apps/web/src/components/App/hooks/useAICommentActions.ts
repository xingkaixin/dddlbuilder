import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { AICommentMode, FieldRow } from '@ddlbuilder/shared-types';
import { useAIComments } from '@/hooks/useAIComments';
import { useToast } from '@/hooks/useToast';

interface UseAICommentActionsParams {
  schemaName: string;
  tableName: string;
  tableComment: string;
  rows: FieldRow[];
  setTableComment: (value: string) => void;
  setRows: (value: FieldRow[] | ((previous: FieldRow[]) => FieldRow[])) => void;
}

export function useAICommentActions({
  schemaName,
  tableName,
  tableComment,
  rows,
  setTableComment,
  setRows,
}: UseAICommentActionsParams) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isLoading, generateComments } = useAIComments();

  const generateFieldComments = useCallback(
    (mode: AICommentMode, targetLocale?: 'zh-CN' | 'en-US') => {
      void (async () => {
        try {
          const result = await generateComments({
            mode,
            targetLocale,
            schemaName,
            tableName: tableName.trim() || 'current_table',
            tableComment,
            fields: rows
              .filter((row) => row.fieldName.trim())
              .map((row) => ({
                fieldName: row.fieldName.trim(),
                fieldType: row.fieldType.trim(),
                fieldComment: row.fieldComment.trim(),
              })),
          });

          if (!result) return;

          const commentsByField = new Map(
            result.fields.map((field) => [field.fieldName, field.fieldComment]),
          );
          if (result.tableComment && (mode === 'translate' || !tableComment.trim())) {
            setTableComment(result.tableComment);
          }
          setRows((previous) =>
            previous.map((row) => {
              const nextComment = commentsByField.get(row.fieldName.trim());
              if (!nextComment || (mode === 'fill_missing' && row.fieldComment.trim())) {
                return row;
              }
              return { ...row, fieldComment: nextComment };
            }),
          );
          showToast(t('aiComments.done'));
        } catch (error) {
          showToast((error as Error).message || t('services.generationFailed'));
        }
      })();
    },
    [
      generateComments,
      rows,
      schemaName,
      setRows,
      setTableComment,
      showToast,
      t,
      tableComment,
      tableName,
    ],
  );

  return {
    isGeneratingComments: isLoading,
    handleGenerateComments: generateFieldComments,
  };
}
