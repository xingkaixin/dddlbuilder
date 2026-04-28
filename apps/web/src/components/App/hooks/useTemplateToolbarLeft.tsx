import { useMemo } from 'react';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';
import type { TableTemplate } from '@/hooks/useTableTemplates';
import { ApplyTemplatePopover } from '../ApplyTemplatePopover';
import { TableTemplatePopover } from '../TableTemplatePopover';

interface UseTemplateToolbarLeftParams {
  templates: FieldTemplate[];
  templatesLoading: boolean;
  handleApplyTemplate: (template: FieldTemplate) => void;
  handleManageTemplates: () => void;
  handleSaveAsTemplate: () => void;
  tableTemplates: TableTemplate[];
  tableTemplatesLoading: boolean;
  handleApplyTableTemplate: (template: TableTemplate) => void;
  handleManageTableTemplates: () => void;
  handleSaveAsTableTemplate: () => void;
}

export function useTemplateToolbarLeft({
  templates,
  templatesLoading,
  handleApplyTemplate,
  handleManageTemplates,
  handleSaveAsTemplate,
  tableTemplates,
  tableTemplatesLoading,
  handleApplyTableTemplate,
  handleManageTableTemplates,
  handleSaveAsTableTemplate,
}: UseTemplateToolbarLeftParams) {
  return useMemo(
    () => (
      <div className="flex items-center gap-2">
        <ApplyTemplatePopover
          templates={templates}
          loading={templatesLoading}
          onApplyTemplate={handleApplyTemplate}
          onManageTemplates={handleManageTemplates}
          onSaveAsTemplate={handleSaveAsTemplate}
        />
        <TableTemplatePopover
          templates={tableTemplates}
          loading={tableTemplatesLoading}
          onApplyTemplate={handleApplyTableTemplate}
          onManageTemplates={handleManageTableTemplates}
          onSaveAsTemplate={handleSaveAsTableTemplate}
        />
      </div>
    ),
    [
      templates,
      templatesLoading,
      handleApplyTemplate,
      handleManageTemplates,
      handleSaveAsTemplate,
      tableTemplates,
      tableTemplatesLoading,
      handleApplyTableTemplate,
      handleManageTableTemplates,
      handleSaveAsTableTemplate,
    ],
  );
}
