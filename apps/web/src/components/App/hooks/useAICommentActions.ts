import { useCallback, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { AICommentMode } from '@ddlbuilder/shared-types';
import type { AppLocale } from '@ddlbuilder/shared-types/locale';
import { useAIComments } from '@/hooks/useAIComments';
import { useToast } from '@/hooks/useToast';
import { useEditorStore } from '@/stores';

interface UseAICommentActionsParams {
  documentKey: string;
  getCurrentDocumentKey: () => string;
}

export function useAICommentActions({
  documentKey,
  getCurrentDocumentKey,
}: UseAICommentActionsParams) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isLoading, generateComments, cancelComments } = useAIComments();

  useLayoutEffect(() => cancelComments, [cancelComments, documentKey]);

  const generateFieldComments = useCallback(
    (mode: AICommentMode, targetLocale?: AppLocale) => {
      const requestDocumentKey = getCurrentDocumentKey();

      const { schemaName, tableName, tableComment, rows, setTableComment, setRows } =
        useEditorStore.getState();

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

          if (!result || getCurrentDocumentKey() !== requestDocumentKey) return;

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
          showToast(
            error instanceof Error
              ? error.message || t('services.generationFailed')
              : t('services.generationFailed'),
          );
        }
      })();
    },
    [generateComments, getCurrentDocumentKey, showToast, t],
  );

  return {
    isGeneratingComments: isLoading,
    handleGenerateComments: generateFieldComments,
  };
}
