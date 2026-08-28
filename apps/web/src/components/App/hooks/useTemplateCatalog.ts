import { useMemo } from 'react';
import { useFieldTemplates } from '@/hooks/useFieldTemplates';
import { useTableTemplates } from '@/hooks/useTableTemplates';
import { useTemplateActions } from './useTemplateActions';
import { useTableTemplateActions } from './useTableTemplateActions';
import { useTemplateToolbarLeft } from './useTemplateToolbarLeft';

type TemplateCatalogParams = Pick<
  Parameters<typeof useTemplateActions>[0],
  'rows' | 'setRows' | 'showToast'
> &
  Pick<Parameters<typeof useTableTemplateActions>[0], 'currentState' | 'applyState'>;

export function useTemplateCatalog({
  rows,
  setRows,
  showToast,
  currentState,
  applyState,
}: TemplateCatalogParams) {
  const fieldTemplateData = useFieldTemplates();
  const tableTemplateData = useTableTemplates();
  const templates = useMemo(
    () => [...fieldTemplateData.templates, ...tableTemplateData.templates],
    [fieldTemplateData.templates, tableTemplateData.templates],
  );
  const templateActions = useTemplateActions({
    rows,
    setRows,
    showToast,
    createTemplateFromFields: fieldTemplateData.createFromFields,
  });
  const tableTemplateActions = useTableTemplateActions({
    currentState,
    applyState,
    showToast,
    createTemplate: tableTemplateData.create,
  });
  const toolbar = useTemplateToolbarLeft({
    templates: fieldTemplateData.templates,
    templatesLoading: fieldTemplateData.loading,
    handleApplyTemplate: templateActions.handleApplyTemplate,
    handleManageTemplates: templateActions.handleManageTemplates,
    handleSaveAsTemplate: templateActions.handleSaveAsTemplate,
    tableTemplates: tableTemplateData.templates,
    tableTemplatesLoading: tableTemplateData.loading,
    handleApplyTableTemplate: tableTemplateActions.handleApplyTemplate,
    handleManageTableTemplates: tableTemplateActions.handleManageTemplates,
    handleSaveAsTableTemplate: tableTemplateActions.handleSaveAsTemplate,
  });
  return {
    templates,
    toolbar,
    fieldTemplateData,
    tableTemplateData,
    templateActions,
    tableTemplateActions,
  };
}
