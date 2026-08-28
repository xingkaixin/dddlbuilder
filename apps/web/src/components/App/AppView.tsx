import { WorkspaceBootstrapScreen } from '@/components/WorkspaceBootstrapScreen';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppDialogLayer } from './AppDialogLayer';
import { AppWorkspace } from './AppWorkspace';
import { useAppController } from './useAppController';

export function AppView() {
  const { workspaceView, dialogLayer, hydrationFailed, retryHydration } = useAppController();
  if (hydrationFailed) return <WorkspaceBootstrapScreen failed onRetry={retryHydration} />;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <AppWorkspace model={workspaceView} />
        <AppDialogLayer model={dialogLayer} />
      </div>
    </TooltipProvider>
  );
}
