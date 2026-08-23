import { useMemo } from 'react';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';

export const useWorkspaceScope = (): WorkspaceScope | null => {
  const { scope, ready } = useWorkspaceScopeState();
  return ready ? scope : null;
};

export const useWorkspaceScopeState = () => {
  const { status, userId, workspaceId } = useAuthSession();

  return useMemo(() => {
    if (status !== 'signed_in') {
      return {
        scope: getAnonymousWorkspaceScope(),
        ready: status !== 'loading',
      };
    }

    if (!userId) {
      return {
        scope: getAnonymousWorkspaceScope(),
        ready: false,
      };
    }

    return {
      scope: {
        kind: 'user' as const,
        userId,
        ...(workspaceId ? { workspaceId } : {}),
      },
      ready: Boolean(workspaceId),
    };
  }, [status, userId, workspaceId]);
};
