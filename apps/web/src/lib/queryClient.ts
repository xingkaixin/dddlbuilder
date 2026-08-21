import { QueryClient } from '@tanstack/react-query';

const MAX_QUERY_RETRIES = 1;

export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= MAX_QUERY_RETRIES) return false;
  if (typeof error !== 'object' || error === null || !('status' in error)) return true;

  const status = error.status;
  return typeof status !== 'number' || status >= 500;
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export const appQueryClient = createAppQueryClient();
