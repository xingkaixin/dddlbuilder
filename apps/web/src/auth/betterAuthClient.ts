import type { BetterAuthClient } from './betterAuthClientRuntime';

export type { BetterAuthClient };

let clientPromise: Promise<BetterAuthClient> | null = null;

export const isBetterAuthConfigured = () => typeof window !== 'undefined';

export const getBetterAuthClient = (): Promise<BetterAuthClient | null> => {
  if (!isBetterAuthConfigured()) {
    return Promise.resolve(null);
  }

  clientPromise ??= import('./betterAuthClientRuntime').then((mod) =>
    mod.getBetterAuthClientInstance(),
  );

  return clientPromise;
};
