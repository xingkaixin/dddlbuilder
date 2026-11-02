import { navigateApp } from '@/lib/appNavigation';
import { useAppUiStore } from '@/stores/appUiStore';
import { isPageToolId } from './toolCatalog';

export interface ToolActions {
  onOpenFieldTemplates: () => void;
  onOpenTableTemplates: () => void;
  onOpenAIGenerate: () => void;
  onOpenAIPatch?: () => void;
  onOpenIndexAdvisor?: () => void;
}

export function openTool(id: string, actions: ToolActions) {
  if (isPageToolId(id)) {
    navigateApp(`/tools/${id}`);

    return;
  }

  switch (id) {
    case 'field-standards':
      useAppUiStore.getState().setIsFieldStandardsOpen(true);

      return;
    case 'field-templates':
      actions.onOpenFieldTemplates();

      return;
    case 'table-templates':
      actions.onOpenTableTemplates();

      return;
    case 'ai-generate':
      navigateApp('/');
      actions.onOpenAIGenerate();

      return;
    case 'ai-patch':
      navigateApp('/');
      actions.onOpenAIPatch?.();

      return;
    case 'ai-comments':
      navigateApp('/');

      return;
    case 'index-advisor':
      navigateApp('/');
      actions.onOpenIndexAdvisor?.();
  }
}
