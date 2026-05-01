import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import {
  migrateLegacyWorkspaceFromLocalStorage,
  readWorkspaceBootstrap,
} from '@/utils/workspaceStateDb';
import { getAnonymousWorkspaceScope, getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';

export type WorkspaceBootstrapRaw = {
  globalDraft: unknown;
  drafts: Array<{ draftId: string; record: unknown }>;
  session: unknown;
  savedTable: unknown;
};

const WORKSPACE_BOOTSTRAP_CACHE_TTL_MS = 50;

const loadWorkspaceBootstrap = async (scope: WorkspaceScope): Promise<WorkspaceBootstrapRaw> => {
  const initial = await readWorkspaceBootstrap(scope).catch(() => ({
    globalDraft: null,
    drafts: [],
    session: null,
    savedTable: null,
  }));

  if (initial.globalDraft || initial.session || (initial.drafts?.length ?? 0) > 0) {
    return initial;
  }

  if (scope.kind === 'anonymous') {
    await migrateLegacyWorkspaceFromLocalStorage().catch(() => undefined);
  }
  return readWorkspaceBootstrap(scope).catch(() => ({
    globalDraft: null,
    drafts: [],
    session: null,
    savedTable: null,
  }));
};

const workspaceBootstrapPromises = new Map<string, Promise<WorkspaceBootstrapRaw>>();
let workspaceBootstrapCache: WorkspaceBootstrapRaw | null = null;
let workspaceBootstrapCacheAt = 0;
let workspaceBootstrapCacheScopeKey = '';

export const resetWorkspaceBootstrapCache = () => {
  workspaceBootstrapPromises.clear();
  workspaceBootstrapCache = null;
  workspaceBootstrapCacheAt = 0;
  workspaceBootstrapCacheScopeKey = '';
};

export const getWorkspaceBootstrap = (scope: WorkspaceScope = getAnonymousWorkspaceScope()) => {
  const scopeKey = getWorkspaceScopeStorageKey(scope);
  if (
    workspaceBootstrapCache &&
    workspaceBootstrapCacheScopeKey === scopeKey &&
    Date.now() - workspaceBootstrapCacheAt < WORKSPACE_BOOTSTRAP_CACHE_TTL_MS
  ) {
    return Promise.resolve(workspaceBootstrapCache);
  }

  const existingPromise = workspaceBootstrapPromises.get(scopeKey);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = loadWorkspaceBootstrap(scope)
    .then((value) => {
      workspaceBootstrapCache = value;
      workspaceBootstrapCacheAt = Date.now();
      workspaceBootstrapCacheScopeKey = scopeKey;
      return value;
    })
    .finally(() => {
      workspaceBootstrapPromises.delete(scopeKey);
    });
  workspaceBootstrapPromises.set(scopeKey, promise);
  return promise;
};
