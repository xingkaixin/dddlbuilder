import { queryOptions } from '@tanstack/react-query';
import { fetchCurrentUser } from '@/services/authService';
import { writeWorkspaceIdentity } from '@/services/workspaceIdentity';

const AUTH_STALE_TIME_MS = 5 * 60_000;

export const authQueryKeys = {
  all: ['auth'] as const,
  me: ['auth', 'me'] as const,
};

export function currentUserOptions() {
  return queryOptions({
    queryKey: authQueryKeys.me,
    queryFn: async ({ client, signal }) => {
      const me = await fetchCurrentUser(signal);

      if (me.signedIn) {
        if (me.workspaceId) {
          client.setQueryData(['workspaces', me.user.userId, 'current'], {
            workspaceId: me.workspaceId,
          });
          writeWorkspaceIdentity({
            kind: 'user',
            userId: me.user.userId,
            workspaceId: me.workspaceId,
          });
        }

        if (me.creditBalance !== undefined) {
          client.setQueryData(['credits', me.user.userId, 'balance'], me.creditBalance);
        }
      }

      return me;
    },
    staleTime: AUTH_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
}
