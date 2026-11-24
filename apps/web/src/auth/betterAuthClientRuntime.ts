import { createAuthClient } from 'better-auth/client';
import { emailOTPClient } from 'better-auth/client/plugins';

const resolveBaseURL = () => import.meta.env.VITE_BETTER_AUTH_URL?.trim() || window.location.origin;

const buildAuthClient = () =>
  createAuthClient({
    baseURL: resolveBaseURL(),
    plugins: [emailOTPClient()],
    fetchOptions: { credentials: 'include' },
  });

export type BetterAuthClient = ReturnType<typeof buildAuthClient>;

let authClient: BetterAuthClient | null = null;

export const getBetterAuthClientInstance = (): BetterAuthClient => {
  authClient ??= buildAuthClient();

  return authClient;
};
