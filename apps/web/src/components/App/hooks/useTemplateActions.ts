import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { FieldRow } from '@ddlbuilder/shared-types';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';
import { instantiateTemplateFields } from '@/utils/fieldTemplates';
import i18n from '@/i18n';

interface CreateTemplateResult {
  ok: boolean;
  message?: string;
}

interface UseTemplateActionsParams {
  rows: FieldRow[];
  setRows: Dispatch<SetStateAction<FieldRow[]>>;
  createTemplateFromFields: (
    name: string,
    fields: Array<Partial<FieldRow>>,
    description?: string,
  ) => Promise<CreateTemplateResult>;
  showToast: (message: string) => void;
}

export function useTemplateActions({
  rows,
  setRows,
  createTemplateFromFields,
  showToast,
}: UseTemplateActionsParams) {
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [isCreateTemplateDialogOpen, setIsCreateTemplateDialogOpen] = useState(false);
  const [selectedFieldsForTemplate, setSelectedFieldsForTemplate] = useState<FieldRow[]>([]);

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

        const newRows = instantiateTemplateFields(template.fields);

        return [...before, ...newRows, ...after];
      });

      showToast(
        i18n.t('templateManager.toast.applied', {
          name: template.name,
          count: template.fields.length,
        }),
      );
    },
    [setRows, showToast],
  );

  const handleCreateTemplateFromFields = useCallback(
    async (name: string, fields: Array<Partial<FieldRow>>, description?: string) => {
      const result = await createTemplateFromFields(name, fields, description);
      if (result.ok) {
        showToast(i18n.t('templateManager.toast.created', { name }));
      } else {
        showToast(result.message ?? i18n.t('templateManager.toast.createFromFieldsFailed'));
      }
      return result;
    },
    [createTemplateFromFields, showToast],
  );

  const handleSaveAsTemplate = useCallback(() => {
    const validRows = rows.filter((row) => row.fieldName.trim());
    if (validRows.length === 0) {
      showToast(i18n.t('templateManager.toast.noValidFieldsForSave'));
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
