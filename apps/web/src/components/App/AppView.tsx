import { useCallback, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppDialogLayer } from './AppDialogLayer';
import { AppWorkspace } from './AppWorkspace';
import { useAppController } from './useAppController';

export function AppView() {
  const controller = useAppController();
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isErDialogOpen, setIsErDialogOpen] = useState(false);
  const [workspaceSidebarOpen, setWorkspaceSidebarOpen] = useState(true);
  const [outputPanelOpen, setOutputPanelOpen] = useState(true);
  const [isAISchemaPatchOpen, setIsAISchemaPatchOpen] = useState(false);
  const { tabs, isShareView } = controller.workspace;
  const { handleOpenAIGenerateDialog } = controller.actions.navigationActions;

  const handleOpenImport = useCallback(() => setIsImportDialogOpen(true), []);
  const handleOpenErDiagram = useCallback(() => setIsErDialogOpen(true), []);
  const handleOpenAISchemaPatch = useCallback(() => {
    if (tabs.length === 0 && !isShareView) {
      handleOpenAIGenerateDialog();
      return;
    }
    setIsAISchemaPatchOpen(true);
  }, [handleOpenAIGenerateDialog, isShareView, tabs.length]);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <AppWorkspace
          controller={controller}
          workspaceSidebarOpen={workspaceSidebarOpen}
          setWorkspaceSidebarOpen={setWorkspaceSidebarOpen}
          outputPanelOpen={outputPanelOpen}
          setOutputPanelOpen={setOutputPanelOpen}
          onOpenImport={handleOpenImport}
          onOpenErDiagram={handleOpenErDiagram}
          onOpenAISchemaPatch={handleOpenAISchemaPatch}
        />
        <AppDialogLayer
          controller={controller}
          isImportDialogOpen={isImportDialogOpen}
          setIsImportDialogOpen={setIsImportDialogOpen}
          isErDialogOpen={isErDialogOpen}
          setIsErDialogOpen={setIsErDialogOpen}
          isAISchemaPatchOpen={isAISchemaPatchOpen}
          setIsAISchemaPatchOpen={setIsAISchemaPatchOpen}
        />
      </div>
    </TooltipProvider>
  );
}
