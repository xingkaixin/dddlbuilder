import { queryOptions } from '@tanstack/react-query';
import { fetchCurrentUser } from '@/services/authService';

const AUTH_STALE_TIME_MS = 30_000;

export const authQueryKeys = {
  all: ['auth'] as const,
  me: ['auth', 'me'] as const,
};

export function currentUserOptions() {
  return queryOptions({
    queryKey: authQueryKeys.me,
    queryFn: ({ signal }) => fetchCurrentUser(signal),
    staleTime: AUTH_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
}
