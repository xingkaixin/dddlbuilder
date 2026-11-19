import { WorkspaceYDocProvider } from '@/providers/WorkspaceYDocProvider';
import { AppView } from './AppView';

export function WorkspaceShell() {
  return (
    <WorkspaceYDocProvider>
      <AppView />
    </WorkspaceYDocProvider>
  );
}
