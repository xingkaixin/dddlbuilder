import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { LocaleProvider } from '@/i18n/LocaleContext';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function createQueryClientWrapper() {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </LocaleProvider>
    );
  }

  return {
    queryClient,
    wrapper: Wrapper,
  };
}
