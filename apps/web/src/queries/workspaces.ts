import { queryOptions } from '@tanstack/react-query';
import { fetchWorkspaceList } from '@/services/workspaceAccountService';

const WORKSPACE_LIST_STALE_TIME_MS = 30_000;

export const workspaceQueryKeys = {
  all: (userId: string) => ['workspaces', userId] as const,
  list: (userId: string) => ['workspaces', userId, 'list'] as const,
};

export function workspaceListOptions(userId: string) {
  return queryOptions({
    queryKey: workspaceQueryKeys.list(userId),
    queryFn: ({ signal }) => fetchWorkspaceList(signal),
    staleTime: WORKSPACE_LIST_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
}
