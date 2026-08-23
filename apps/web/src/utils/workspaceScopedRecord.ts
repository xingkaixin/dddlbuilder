import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { getAnonymousWorkspaceScope, getWorkspaceScopeStorageKey } from './workspaceScope';

const LEGACY_SCOPE = getWorkspaceScopeStorageKey(getAnonymousWorkspaceScope());

export type DecodedScopedKey = {
  key: string;
  scope: string;
};

export const decodeWorkspaceScopedKey = (
  rawKey: string,
  recordScope: string | undefined,
  scope: WorkspaceScope,
): DecodedScopedKey | null => {
  const scopeKey = getWorkspaceScopeStorageKey(scope);
  if (recordScope && recordScope !== scopeKey) return null;

  if (rawKey.includes('::')) {
    const prefix = `${scopeKey}::`;
    return rawKey.startsWith(prefix) ? { key: rawKey.slice(prefix.length), scope: scopeKey } : null;
  }

  return scope.kind === 'anonymous' ? { key: rawKey, scope: LEGACY_SCOPE } : null;
};
