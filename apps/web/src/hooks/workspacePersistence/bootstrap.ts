import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import {
  migrateLegacyWorkspaceFromLocalStorage,
  readWorkspaceBootstrap,
} from '@/utils/workspaceStateDb';
import { getAnonymousWorkspaceScope, getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';

export type WorkspaceBootstrap = Awaited<ReturnType<typeof readWorkspaceBootstrap>>;

const loadWorkspaceBootstrap = async (scope: WorkspaceScope): Promise<WorkspaceBootstrap> => {
  const initial = await readWorkspaceBootstrap(scope);

  if (initial.globalDraft || initial.session || (initial.drafts?.length ?? 0) > 0) {
    return initial;
  }

  if (scope.kind === 'anonymous') {
    await migrateLegacyWorkspaceFromLocalStorage();
  }
  return readWorkspaceBootstrap(scope);
};

const workspaceBootstrapPromises = new Map<string, Promise<WorkspaceBootstrap>>();

export const getWorkspaceBootstrap = (scope: WorkspaceScope = getAnonymousWorkspaceScope()) => {
  const scopeKey = getWorkspaceScopeStorageKey(scope);
  const existingPromise = workspaceBootstrapPromises.get(scopeKey);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = loadWorkspaceBootstrap(scope).finally(() => {
    workspaceBootstrapPromises.delete(scopeKey);
  });
  workspaceBootstrapPromises.set(scopeKey, promise);
  return promise;
};
