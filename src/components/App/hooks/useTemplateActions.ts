import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { FieldRow } from '@/types';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';

interface CreateTemplateResult {
  ok: boolean;
  message?: string;
}

type AnalyticsValue = string | number | boolean | null | undefined;

interface UseTemplateActionsParams {
  rows: FieldRow[];
  setRows: Dispatch<SetStateAction<FieldRow[]>>;
  createTemplateFromFields: (
    name: string,
    fields: Array<{
      fieldName?: string;
      fieldType?: string;
      fieldComment?: string;
      nullable?: string;
      defaultKind?: string;
      defaultValue?: string;
      onUpdate?: string;
    }>,
    description?: string,
  ) => Promise<CreateTemplateResult>;
  showToast: (message: string) => void;
  trackEvent: (
    event: string,
    data?: Record<string, AnalyticsValue>,
  ) => Promise<void>;
}

export function useTemplateActions({
  rows,
  setRows,
  createTemplateFromFields,
  showToast,
  trackEvent,
}: UseTemplateActionsParams) {
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [isCreateTemplateDialogOpen, setIsCreateTemplateDialogOpen] =
    useState(false);
  const [selectedFieldsForTemplate, setSelectedFieldsForTemplate] = useState<
    FieldRow[]
  >([]);

  const handleManageTemplates = useCallback(() => {
    setIsTemplateManagerOpen(true);
  }, []);

  const handleApplyTemplate = useCallback(
    (template: FieldTemplate) => {
      setRows((prevRows) => {
        // 找到最后一个非空字段行的索引
        let lastFilledIndex = -1;
        for (let i = prevRows.length - 1; i >= 0; i--) {
          if (prevRows[i].fieldName.trim() !== '') {
            lastFilledIndex = i;
            break;
          }
        }
        const insertAt = lastFilledIndex + 1;

        const before = prevRows.slice(0, insertAt);
        const after = prevRows.slice(insertAt);

        const newRows: FieldRow[] = template.fields.map((field, index) => ({
          order: insertAt + index + 1,
          fieldName: field.fieldName,
          fieldComment: field.fieldComment || '',
          fieldType: field.fieldType,
          nullable: field.nullable,
          defaultKind: field.defaultKind || '无',
          defaultValue: field.defaultValue || '',
          onUpdate: field.onUpdate || '无',
        }));

        return [...before, ...newRows, ...after].map((row, idx) => ({
          ...row,
          order: idx + 1,
        }));
      });

      trackEvent('template_apply', { templateName: template.name });
      showToast(
        `已应用模板「${template.name}」，添加了 ${template.fields.length} 个字段`,
      );
    },
    [setRows, showToast, trackEvent],
  );

  const handleCreateTemplateFromFields = useCallback(
    async (
      name: string,
      fields: Array<{
        fieldName?: string;
        fieldType?: string;
        fieldComment?: string;
        nullable?: string;
        defaultKind?: string;
        defaultValue?: string;
        onUpdate?: string;
      }>,
      description?: string,
    ) => {
      const result = await createTemplateFromFields(name, fields, description);
      if (result.ok) {
        trackEvent('template_create', { templateName: name });
        showToast(`已创建模板「${name}」`);
      } else {
        showToast(result.message ?? '创建失败');
      }
      return result;
    },
    [createTemplateFromFields, showToast, trackEvent],
  );

  const handleSaveAsTemplate = useCallback(() => {
    const validRows = rows.filter((row) => row.fieldName.trim());
    if (validRows.length === 0) {
      showToast('当前表中没有有效字段可保存');
      return;
    }

    setSelectedFieldsForTemplate(validRows);
    setIsCreateTemplateDialogOpen(true);
  }, [rows, showToast]);

  return {
    isTemplateManagerOpen,
    setIsTemplateManagerOpen,
    isCreateTemplateDialogOpen,
    setIsCreateTemplateDialogOpen,
    selectedFieldsForTemplate,
    handleManageTemplates,
    handleApplyTemplate,
    handleCreateTemplateFromFields,
    handleSaveAsTemplate,
  };
}
