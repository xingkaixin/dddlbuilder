import { useMemo } from 'react';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';

export const useWorkspaceScope = (): WorkspaceScope | null => {
  const { status, userId, workspaceId } = useAuthSession();

  return useMemo(() => {
    if (status === 'loading') return null;
    if (status === 'signed_out') return getAnonymousWorkspaceScope();
    if (!userId || !workspaceId) return null;
    return { kind: 'user', userId, workspaceId };
  }, [status, userId, workspaceId]);
};
