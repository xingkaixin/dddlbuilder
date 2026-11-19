import { navigateApp } from '@/lib/appNavigation';
import { useAppUiStore } from '@/stores/appUiStore';
import { isPageToolId } from './toolCatalog';

export interface ToolActions {
  onOpenFieldTemplates: () => void;
  onOpenTableTemplates: () => void;
  onOpenAIGenerate: () => void;
  onOpenAIPatch?: () => void;
  onRunAIComments?: () => void;
  onOpenIndexAdvisor?: () => void;
  onRequireTable?: () => void;
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

      if (actions.onOpenAIPatch) actions.onOpenAIPatch();
      else actions.onRequireTable?.();

      return;
    case 'ai-comments':
      navigateApp('/');

      if (actions.onRunAIComments) actions.onRunAIComments();
      else actions.onRequireTable?.();

      return;
    case 'index-advisor':
      navigateApp('/');

      if (actions.onOpenIndexAdvisor) actions.onOpenIndexAdvisor();
      else actions.onRequireTable?.();
  }
}
