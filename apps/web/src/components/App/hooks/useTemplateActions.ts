import { useCallback, useReducer, type Dispatch, type SetStateAction } from 'react';
import type { FieldRow } from '@ddlbuilder/shared-types';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';
import { instantiateTemplateFields } from '@/utils/fieldTemplates';
import i18n from '@/i18n';

interface CreateTemplateResult {
  ok: boolean;
  message?: string;
}

type TemplateDialogsState = {
  isTemplateManagerOpen: boolean;
  isCreateTemplateDialogOpen: boolean;
  selectedFieldsForTemplate: FieldRow[];
};

type TemplateDialogsEvent =
  | { type: 'managerOpenChanged'; open: boolean }
  | { type: 'createDialogOpenChanged'; open: boolean }
  | { type: 'saveAsTemplateRequested'; fields: FieldRow[] };

const initialTemplateDialogsState: TemplateDialogsState = {
  isTemplateManagerOpen: false,
  isCreateTemplateDialogOpen: false,
  selectedFieldsForTemplate: [],
};

function templateDialogsReducer(
  state: TemplateDialogsState,
  event: TemplateDialogsEvent,
): TemplateDialogsState {
  switch (event.type) {
    case 'managerOpenChanged':
      return { ...state, isTemplateManagerOpen: event.open };
    case 'createDialogOpenChanged':
      return { ...state, isCreateTemplateDialogOpen: event.open };
    case 'saveAsTemplateRequested':
      return {
        ...state,
        isCreateTemplateDialogOpen: true,
        selectedFieldsForTemplate: event.fields,
      };
  }
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
  const [
    { isTemplateManagerOpen, isCreateTemplateDialogOpen, selectedFieldsForTemplate },
    dispatch,
  ] = useReducer(templateDialogsReducer, initialTemplateDialogsState);

  const setIsTemplateManagerOpen = useCallback(
    (open: boolean) => dispatch({ type: 'managerOpenChanged', open }),
    [],
  );

  const setIsCreateTemplateDialogOpen = useCallback(
    (open: boolean) => dispatch({ type: 'createDialogOpenChanged', open }),
    [],
  );

  const handleManageTemplates = useCallback(() => {
    setIsTemplateManagerOpen(true);
  }, [setIsTemplateManagerOpen]);

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

    dispatch({ type: 'saveAsTemplateRequested', fields: validRows });
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
