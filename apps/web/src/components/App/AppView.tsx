import { useCallback } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAppUiStore } from '@/stores';
import { useShallow } from 'zustand/react/shallow';
import { AppDialogLayer } from './AppDialogLayer';
import { AppWorkspace } from './AppWorkspace';
import { useAppController } from './useAppController';

export function AppView() {
  const { view, workspaceView, dialogLayer } = useAppController();
  const {
    isImportDialogOpen,
    isErDialogOpen,
    workspaceSidebarOpen,
    outputPanelOpen,
    isAISchemaPatchOpen,
  } = useAppUiStore(
    useShallow((state) => ({
      isImportDialogOpen: state.isImportDialogOpen,
      isErDialogOpen: state.isErDialogOpen,
      workspaceSidebarOpen: state.workspaceSidebarOpen,
      outputPanelOpen: state.outputPanelOpen,
      isAISchemaPatchOpen: state.isAISchemaPatchOpen,
    })),
  );
  const {
    setIsImportDialogOpen,
    setIsErDialogOpen,
    setWorkspaceSidebarOpen,
    setOutputPanelOpen,
    setIsAISchemaPatchOpen,
  } = useAppUiStore.getState();
  const { tabs, isShareView, handleOpenAIGenerateDialog } = view;

  const handleOpenImport = useCallback(() => setIsImportDialogOpen(true), [setIsImportDialogOpen]);
  const handleOpenErDiagram = useCallback(() => setIsErDialogOpen(true), [setIsErDialogOpen]);
  const handleOpenAISchemaPatch = useCallback(() => {
    if (tabs.length === 0 && !isShareView) {
      handleOpenAIGenerateDialog();
      return;
    }
    setIsAISchemaPatchOpen(true);
  }, [handleOpenAIGenerateDialog, isShareView, setIsAISchemaPatchOpen, tabs.length]);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <AppWorkspace
          model={workspaceView}
          workspaceSidebarOpen={workspaceSidebarOpen}
          setWorkspaceSidebarOpen={setWorkspaceSidebarOpen}
          outputPanelOpen={outputPanelOpen}
          setOutputPanelOpen={setOutputPanelOpen}
          onOpenImport={handleOpenImport}
          onOpenErDiagram={handleOpenErDiagram}
          onOpenAISchemaPatch={handleOpenAISchemaPatch}
        />
        <AppDialogLayer
          model={dialogLayer}
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
