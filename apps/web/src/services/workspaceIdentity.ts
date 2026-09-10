import type { UserWorkspaceScope } from '@ddlbuilder/shared-types/workspace';

export const WORKSPACE_IDENTITY_KEY = 'ddlbuilder:workspace-identity:v1';
const IDENTITY_CHANGED = 'ddlbuilder:workspace-identity-changed';

const isWorkspaceIdentityRecord = (
  value: unknown,
): value is { userId: string; workspaceId: string } =>
  typeof value === 'object' &&
  value !== null &&
  'userId' in value &&
  typeof value.userId === 'string' &&
  value.userId.trim().length > 0 &&
  'workspaceId' in value &&
  typeof value.workspaceId === 'string' &&
  value.workspaceId.trim().length > 0;

export const readWorkspaceIdentity = (): string | null => {
  try {
    return localStorage.getItem(WORKSPACE_IDENTITY_KEY);
  } catch {
    return null;
  }
};

export const parseWorkspaceIdentity = (value: string | null): UserWorkspaceScope | null => {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);

    if (!isWorkspaceIdentityRecord(parsed)) return null;

    return { kind: 'user', userId: parsed.userId, workspaceId: parsed.workspaceId };
  } catch {
    return null;
  }
};

export const writeWorkspaceIdentity = (scope: UserWorkspaceScope | null) => {
  const value = scope
    ? JSON.stringify({ userId: scope.userId, workspaceId: scope.workspaceId })
    : null;

  if (readWorkspaceIdentity() === value) return;

  try {
    if (value) localStorage.setItem(WORKSPACE_IDENTITY_KEY, value);
    else localStorage.removeItem(WORKSPACE_IDENTITY_KEY);
    window.dispatchEvent(new Event(IDENTITY_CHANGED));
  } catch (error) {
    console.error('[workspace] failed to remember local workspace identity', error);
  }
};

export const subscribeWorkspaceIdentity = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === WORKSPACE_IDENTITY_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(IDENTITY_CHANGED, onChange);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(IDENTITY_CHANGED, onChange);
  };
};
