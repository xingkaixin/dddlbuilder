import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import { workspaceLocalQueryKeys } from '@/queries/workspaceLocal';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import { useWorkspaceStorageTarget } from './useWorkspaceStorageTarget';

export function useWorkspaceAuthority() {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();
  const yDocGateway = useWorkspaceYDocGateway(scope);
  const storage = useWorkspaceStorageTarget({
    scope,
    yDoc: yDocGateway.yDoc,
    runInYDoc: yDocGateway.runInYDoc,
  });

  const refresh = useCallback(async () => {
    if (!scope) return;
    await queryClient.invalidateQueries({ queryKey: workspaceLocalQueryKeys.scope(scope) });
  }, [queryClient, scope]);

  useEffect(() => {
    const handleSnapshotApplied = () => void refresh();
    window.addEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    return () =>
      window.removeEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
  }, [refresh]);

  return { scope, ...yDocGateway, storage, refresh };
}
