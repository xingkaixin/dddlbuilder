import type { UserWorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { parseWorkspaceIdentity } from './workspaceIdentity';

const CACHE_REGISTRY_KEY = 'ddlbuilder:workspace-caches:v1';
type WorkspaceCache = UserWorkspaceScope & { status: 'active' | 'pending_cleanup' };

export const readWorkspaceCaches = (): WorkspaceCache[] => {
  const value: unknown = JSON.parse(localStorage.getItem(CACHE_REGISTRY_KEY) ?? '[]');
  if (!Array.isArray(value)) throw new Error('Invalid workspace cache registry');
  return value.map((item: unknown) => {
    const scope = parseWorkspaceIdentity(JSON.stringify(item));
    if (
      !scope ||
      typeof item !== 'object' ||
      item === null ||
      !('status' in item) ||
      (item.status !== 'active' && item.status !== 'pending_cleanup')
    )
      throw new Error('Invalid workspace cache entry');
    return { ...scope, status: item.status };
  });
};

const writeCaches = (caches: WorkspaceCache[]) => {
  if (caches.length) localStorage.setItem(CACHE_REGISTRY_KEY, JSON.stringify(caches));
  else localStorage.removeItem(CACHE_REGISTRY_KEY);
};

export const rememberWorkspaceCache = (scope: UserWorkspaceScope) => {
  const caches = readWorkspaceCaches();
  if (
    caches.some((cache) => cache.userId === scope.userId && cache.workspaceId === scope.workspaceId)
  )
    return;
  writeCaches([
    ...caches.filter((cache) => cache.workspaceId !== scope.workspaceId),
    { ...scope, status: 'active' },
  ]);
};

export const markWorkspaceCleanupPending = (scope: UserWorkspaceScope): UserWorkspaceScope[] => {
  rememberWorkspaceCache(scope);
  const caches = readWorkspaceCaches().map((cache) =>
    cache.userId === scope.userId ? { ...cache, status: 'pending_cleanup' as const } : cache,
  );
  writeCaches(caches);
  return caches
    .filter((cache) => cache.userId === scope.userId)
    .map(({ kind, userId, workspaceId }) => ({ kind, userId, workspaceId }));
};

export const forgetWorkspaceCache = (scope: UserWorkspaceScope) => {
  writeCaches(
    readWorkspaceCaches().filter(
      (cache) => cache.userId !== scope.userId || cache.workspaceId !== scope.workspaceId,
    ),
  );
};
