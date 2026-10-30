import { useCallback, useReducer } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { TableBlueprint, TableTemplate } from '@/hooks/useTableTemplates';
import { applyBlueprintToState, createBlueprintFromState } from '@/utils/tableTemplates';
import i18n from '@/i18n';

type TableTemplateDialogsState = {
  isManagerOpen: boolean;
  isCreateDialogOpen: boolean;
  pendingBlueprint: TableBlueprint | null;
};

type TableTemplateDialogsEvent =
  | { type: 'managerOpenChanged'; open: boolean }
  | { type: 'createDialogOpenChanged'; open: boolean }
  | { type: 'saveAsTemplateRequested'; blueprint: TableBlueprint };

const initialTableTemplateDialogsState: TableTemplateDialogsState = {
  isManagerOpen: false,
  isCreateDialogOpen: false,
  pendingBlueprint: null,
};

function tableTemplateDialogsReducer(
  state: TableTemplateDialogsState,
  event: TableTemplateDialogsEvent,
): TableTemplateDialogsState {
  switch (event.type) {
    case 'managerOpenChanged':
      return { ...state, isManagerOpen: event.open };
    case 'createDialogOpenChanged':
      return { ...state, isCreateDialogOpen: event.open };
    case 'saveAsTemplateRequested':
      return { ...state, isCreateDialogOpen: true, pendingBlueprint: event.blueprint };
  }
}

interface UseTableTemplateActionsParams {
  getCurrentState: () => PersistedState;
  applyState: (state: PersistedState) => void;
  createTemplate: (
    name: string,
    blueprint: TableBlueprint,
    description?: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  showToast: (message: string) => void;
}

export function useTableTemplateActions({
  getCurrentState,
  applyState,
  createTemplate,
  showToast,
}: UseTableTemplateActionsParams) {
  const [{ isManagerOpen, isCreateDialogOpen, pendingBlueprint }, dispatch] = useReducer(
    tableTemplateDialogsReducer,
    initialTableTemplateDialogsState,
  );

  const setIsManagerOpen = useCallback(
    (open: boolean) => dispatch({ type: 'managerOpenChanged', open }),
    [],
  );

  const setIsCreateDialogOpen = useCallback(
    (open: boolean) => dispatch({ type: 'createDialogOpenChanged', open }),
    [],
  );
  const handleManageTemplates = useCallback(() => setIsManagerOpen(true), [setIsManagerOpen]);

  const handleSaveAsTemplate = useCallback(() => {
    const blueprint = createBlueprintFromState(getCurrentState());

    if (blueprint.rows.length === 0) {
      showToast(i18n.t('tableTemplate.toast.noValidFieldsForSave'));

      return;
    }

    dispatch({ type: 'saveAsTemplateRequested', blueprint });
  }, [getCurrentState, showToast]);

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
      applyState(applyBlueprintToState(getCurrentState(), template.blueprint));
      showToast(i18n.t('tableTemplate.toast.applied', { name: template.name }));
    },
    [applyState, getCurrentState, showToast],
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
