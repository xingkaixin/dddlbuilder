import { queryOptions } from '@tanstack/react-query';
import { fetchCurrentWorkspace } from '@/services/workspaceAccountService';
import { writeWorkspaceIdentity } from '@/services/workspaceIdentity';
import { currentUserOptions } from './auth';

const CURRENT_WORKSPACE_STALE_TIME_MS = 30_000;

export const workspaceQueryKeys = {
  all: (userId: string) => ['workspaces', userId] as const,
  current: (userId: string) => ['workspaces', userId, 'current'] as const,
};

export function currentWorkspaceOptions(userId: string) {
  return queryOptions({
    queryKey: workspaceQueryKeys.current(userId),
    queryFn: async ({ client, signal }) => {
      try {
        const workspace = await fetchCurrentWorkspace(signal);
        const currentUser = client.getQueryData(currentUserOptions().queryKey);

        // A sign-out here or in another tab can land while this request is in flight.
        if (currentUser?.signedIn && currentUser.user.userId === userId) {
          writeWorkspaceIdentity({ kind: 'user', userId, workspaceId: workspace.workspaceId });
        }

        return workspace;
      } catch (error) {
        if (!signal.aborted) console.error('[auth] failed to resolve workspace', error);

        throw error;
      }
    },
    staleTime: CURRENT_WORKSPACE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
}
