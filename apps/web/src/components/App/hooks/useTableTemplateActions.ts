import { useCallback, useState } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { TableBlueprint, TableTemplate } from '@/hooks/useTableTemplates';
import { applyBlueprintToState, createBlueprintFromState } from '@/utils/tableTemplates';
import i18n from '@/i18n';

type AnalyticsValue = string | number | boolean | null | undefined;

interface UseTableTemplateActionsParams {
  currentState: PersistedState;
  applyState: (state: PersistedState) => void;
  createTemplate: (
    name: string,
    blueprint: TableBlueprint,
    description?: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  clearLoadedTable: () => void;
  showToast: (message: string) => void;
  trackEvent: (event: string, data?: Record<string, AnalyticsValue>) => Promise<void>;
}

export function useTableTemplateActions({
  currentState,
  applyState,
  createTemplate,
  clearLoadedTable,
  showToast,
  trackEvent,
}: UseTableTemplateActionsParams) {
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [pendingBlueprint, setPendingBlueprint] = useState<TableBlueprint | null>(null);

  const handleSaveAsTemplate = useCallback(() => {
    const blueprint = createBlueprintFromState(currentState);
    if (blueprint.rows.length === 0) {
      showToast(i18n.t('tableTemplate.toast.noValidFieldsForSave'));
      return;
    }
    setPendingBlueprint(blueprint);
    setIsCreateDialogOpen(true);
  }, [currentState, showToast]);

  const handleCreateTemplate = useCallback(
    async (name: string, blueprint: TableBlueprint, description?: string) => {
      const result = await createTemplate(name, blueprint, description);
      showToast(
        result.ok
          ? i18n.t('tableTemplate.toast.created', { name })
          : (result.message ?? i18n.t('tableTemplate.toast.createFailed')),
      );
      if (result.ok) {
        void trackEvent('table_template_create', { templateName: name });
      }
      return result;
    },
    [createTemplate, showToast, trackEvent],
  );

  const handleApplyTemplate = useCallback(
    (template: TableTemplate) => {
      applyState(applyBlueprintToState(currentState, template.blueprint));
      clearLoadedTable();
      void trackEvent('table_template_apply', { templateName: template.name });
      showToast(i18n.t('tableTemplate.toast.applied', { name: template.name }));
    },
    [applyState, clearLoadedTable, currentState, showToast, trackEvent],
  );

  return {
    isManagerOpen,
    setIsManagerOpen,
    isCreateDialogOpen,
    setIsCreateDialogOpen,
    pendingBlueprint,
    handleManageTemplates: () => setIsManagerOpen(true),
    handleSaveAsTemplate,
    handleCreateTemplate,
    handleApplyTemplate,
  };
}
