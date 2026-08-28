import { useCallback, useState } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { TableBlueprint, TableTemplate } from '@/hooks/useTableTemplates';
import { applyBlueprintToState, createBlueprintFromState } from '@/utils/tableTemplates';
import i18n from '@/i18n';

interface UseTableTemplateActionsParams {
  currentState: PersistedState;
  applyState: (state: PersistedState) => void;
  createTemplate: (
    name: string,
    blueprint: TableBlueprint,
    description?: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  showToast: (message: string) => void;
}

export function useTableTemplateActions({
  currentState,
  applyState,
  createTemplate,
  showToast,
}: UseTableTemplateActionsParams) {
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [pendingBlueprint, setPendingBlueprint] = useState<TableBlueprint | null>(null);
  const handleManageTemplates = useCallback(() => setIsManagerOpen(true), []);

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
      return result;
    },
    [createTemplate, showToast],
  );

  const handleApplyTemplate = useCallback(
    (template: TableTemplate) => {
      applyState(applyBlueprintToState(currentState, template.blueprint));
      showToast(i18n.t('tableTemplate.toast.applied', { name: template.name }));
    },
    [applyState, currentState, showToast],
  );

  return {
    isManagerOpen,
    setIsManagerOpen,
    isCreateDialogOpen,
    setIsCreateDialogOpen,
    pendingBlueprint,
    handleManageTemplates,
    handleSaveAsTemplate,
    handleCreateTemplate,
    handleApplyTemplate,
  };
}
