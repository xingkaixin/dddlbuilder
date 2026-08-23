import { queryOptions } from '@tanstack/react-query';
import { fetchCurrentWorkspace } from '@/services/workspaceAccountService';

const CURRENT_WORKSPACE_STALE_TIME_MS = 30_000;

export const workspaceQueryKeys = {
  all: (userId: string) => ['workspaces', userId] as const,
  current: (userId: string) => ['workspaces', userId, 'current'] as const,
};

export function currentWorkspaceOptions(userId: string) {
  return queryOptions({
    queryKey: workspaceQueryKeys.current(userId),
    queryFn: ({ signal }) => fetchCurrentWorkspace(signal),
    staleTime: CURRENT_WORKSPACE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
}
