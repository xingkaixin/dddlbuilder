import { useMemo } from 'react';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';

export const useWorkspaceScope = (): WorkspaceScope | null => {
  const { scope, ready } = useWorkspaceScopeState();
  return ready ? scope : null;
};

export const useWorkspaceScopeState = () => {
  const { status, workspaceScope } = useAuthSession();

  return useMemo(() => {
    return {
      scope: workspaceScope ?? getAnonymousWorkspaceScope(),
      ready: Boolean(workspaceScope) || status === 'signed_out',
    };
  }, [status, workspaceScope]);
};
