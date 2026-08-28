import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import { workspaceLocalQueryKeys } from '@/queries/workspaceLocal';
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
    if (!scope || storage.kind !== 'indexeddb') return;
    await queryClient.invalidateQueries({ queryKey: workspaceLocalQueryKeys.scope(scope) });
  }, [queryClient, scope, storage.kind]);

  return { scope, ...yDocGateway, storage, refresh };
}
