import { stableStringify } from './stableStringify';

export const buildWorkspaceContentHash = async (payload: unknown) => {
  const bytes = new TextEncoder().encode(stableStringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
};
