/* oxlint-disable anti-slop/no-unknown-parameters -- Content hashing intentionally accepts the complete stableStringify value domain. */

import { stableStringify } from './stableStringify';

type HashRuntime = typeof globalThis & {
  TextEncoder: new () => {
    encode: (input: string) => Uint8Array;
  };
  crypto: {
    subtle: {
      digest: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer>;
    };
  };
};

export const buildWorkspaceContentHash = async (payload: unknown) => {
  // SAFETY: browser and Worker runtimes provide globalThis.TextEncoder and globalThis.crypto.subtle.digest.
  const runtime = globalThis as HashRuntime;
  const bytes = new runtime.TextEncoder().encode(stableStringify(payload));
  const digest = await runtime.crypto.subtle.digest('SHA-256', bytes);

  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
};
