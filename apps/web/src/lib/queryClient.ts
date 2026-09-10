import { QueryClient } from '@tanstack/react-query';

const MAX_QUERY_RETRIES = 1;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- TanStack Query supplies arbitrary thrown values to retry callbacks.
export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= MAX_QUERY_RETRIES) return false;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- retry policy must inspect arbitrary thrown values at runtime.
  if (typeof error !== 'object' || error === null || !('status' in error)) return true;

  const status = error.status;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the status property is supplied by an unknown thrown object.
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
