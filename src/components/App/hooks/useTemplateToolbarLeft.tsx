import { useMemo } from 'react';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';
import { ApplyTemplatePopover } from '../ApplyTemplatePopover';

interface UseTemplateToolbarLeftParams {
  templates: FieldTemplate[];
  templatesLoading: boolean;
  handleApplyTemplate: (template: FieldTemplate) => void;
  handleManageTemplates: () => void;
  handleSaveAsTemplate: () => void;
}

export function useTemplateToolbarLeft({
  templates,
  templatesLoading,
  handleApplyTemplate,
  handleManageTemplates,
  handleSaveAsTemplate,
}: UseTemplateToolbarLeftParams) {
  return useMemo(
    () => (
      <ApplyTemplatePopover
        templates={templates}
        loading={templatesLoading}
        onApplyTemplate={handleApplyTemplate}
        onManageTemplates={handleManageTemplates}
        onSaveAsTemplate={handleSaveAsTemplate}
      />
    ),
    [
      templates,
      templatesLoading,
      handleApplyTemplate,
      handleManageTemplates,
      handleSaveAsTemplate,
    ],
  );
}
