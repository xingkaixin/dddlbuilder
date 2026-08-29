import { useMemo } from 'react';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { useAuthIdentity } from '@/auth/AuthSessionProvider';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';

export const useWorkspaceScope = (): WorkspaceScope | null => {
  const { scope, ready } = useWorkspaceScopeState();
  return ready ? scope : null;
};

export const useWorkspaceScopeState = () => {
  const { status, workspaceScope } = useAuthIdentity();

  return useMemo(() => {
    return {
      scope: workspaceScope ?? getAnonymousWorkspaceScope(),
      ready: Boolean(workspaceScope) || status === 'signed_out',
    };
  }, [status, workspaceScope]);
};
