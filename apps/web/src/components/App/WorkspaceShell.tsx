import { listenForEditorShortcuts } from '@/lib/editorShortcuts';
import { WorkspaceYDocProvider } from '@/providers/WorkspaceYDocProvider';
import { AppView } from './AppView';

listenForEditorShortcuts();

export function WorkspaceShell() {
  return (
    <WorkspaceYDocProvider>
      <AppView />
    </WorkspaceYDocProvider>
  );
}
