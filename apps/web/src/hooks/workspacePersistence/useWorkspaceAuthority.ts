import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import { workspaceLocalQueryKeys } from '@/queries/workspaceLocal';
import { invalidateLegacyWorkspaceMigration } from '@/services/workspaceLegacyMigrationMarker';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';

export function useWorkspaceAuthority() {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();
  const yDocGateway = useWorkspaceYDocGateway(scope);

  const refresh = useCallback(async () => {
    if (!scope) return;
    await queryClient.invalidateQueries({ queryKey: workspaceLocalQueryKeys.scope(scope) });
  }, [queryClient, scope]);

  const writeLocalFallback = useCallback(
    async (write: () => Promise<void>) => {
      await write();
      if (scope?.kind === 'user' && scope.workspaceId) {
        invalidateLegacyWorkspaceMigration(scope);
      }
    },
    [scope],
  );

  useEffect(() => {
    const handleSnapshotApplied = () => void refresh();
    window.addEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    return () =>
      window.removeEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
  }, [refresh]);

  return { scope, ...yDocGateway, refresh, writeLocalFallback };
}
