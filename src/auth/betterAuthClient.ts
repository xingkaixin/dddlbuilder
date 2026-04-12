import { createAuthClient } from 'better-auth/client';

let authClient: ReturnType<typeof createAuthClient> | null | undefined;

const resolveBaseURL = () => import.meta.env.VITE_BETTER_AUTH_URL?.trim() || window.location.origin;

export const isBetterAuthConfigured = () => typeof window !== 'undefined';

export const getBetterAuthClient = () => {
  if (authClient !== undefined) {
    return authClient;
  }

  if (!isBetterAuthConfigured()) {
    authClient = null;
    return authClient;
  }

  authClient = createAuthClient({
    baseURL: resolveBaseURL(),
    fetchOptions: {
      credentials: 'include',
    },
  });

  return authClient;
};
