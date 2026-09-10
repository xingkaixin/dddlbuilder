import { createAuthClient } from 'better-auth/client';
import { emailOTPClient } from 'better-auth/client/plugins';

const buildAuthClient = () =>
  createAuthClient({
    baseURL: resolveBaseURL(),
    plugins: [emailOTPClient()],
    fetchOptions: { credentials: 'include' },
  });

let authClient: ReturnType<typeof buildAuthClient> | null | undefined;

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

  authClient = buildAuthClient();

  return authClient;
};
