import { TooltipProvider } from '@/components/ui/tooltip';
import { AppDialogLayer } from './AppDialogLayer';
import { AppWorkspace } from './AppWorkspace';
import { useAppController } from './useAppController';

export function AppView() {
  const { workspaceView, dialogLayer } = useAppController();

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <AppWorkspace model={workspaceView} />
        <AppDialogLayer model={dialogLayer} />
      </div>
    </TooltipProvider>
  );
}
