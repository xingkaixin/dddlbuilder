import { useCallback, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppDialogLayer } from './AppDialogLayer';
import { AppWorkspace } from './AppWorkspace';
import { toAppDialogModel, toAppShellModel, toAppWorkspaceModel } from './appViewModel';
import { useAppController } from './useAppController';

export function AppView() {
  const controller = useAppController();
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isErDialogOpen, setIsErDialogOpen] = useState(false);
  const [workspaceSidebarOpen, setWorkspaceSidebarOpen] = useState(true);
  const [outputPanelOpen, setOutputPanelOpen] = useState(true);
  const [isAISchemaPatchOpen, setIsAISchemaPatchOpen] = useState(false);
  const shell = toAppShellModel(controller);
  const workspaceModel = toAppWorkspaceModel(controller);
  const dialogModel = toAppDialogModel(controller);
  const { tabs, isShareView, openAIGenerateDialog } = shell;

  const handleOpenImport = useCallback(() => setIsImportDialogOpen(true), []);
  const handleOpenErDiagram = useCallback(() => setIsErDialogOpen(true), []);
  const handleOpenAISchemaPatch = useCallback(() => {
    if (tabs.length === 0 && !isShareView) {
      openAIGenerateDialog();
      return;
    }
    setIsAISchemaPatchOpen(true);
  }, [isShareView, openAIGenerateDialog, tabs.length]);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <AppWorkspace
          {...workspaceModel}
          workspaceSidebarOpen={workspaceSidebarOpen}
          setWorkspaceSidebarOpen={setWorkspaceSidebarOpen}
          outputPanelOpen={outputPanelOpen}
          setOutputPanelOpen={setOutputPanelOpen}
          onOpenImport={handleOpenImport}
          onOpenErDiagram={handleOpenErDiagram}
          onOpenAISchemaPatch={handleOpenAISchemaPatch}
        />
        <AppDialogLayer
          {...dialogModel}
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
