import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import {
  migrateLegacyWorkspaceFromLocalStorage,
  readWorkspaceBootstrap,
} from '@/utils/workspaceStateDb';

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

let workspaceBootstrapPromise: Promise<WorkspaceBootstrapRaw> | null = null;
let workspaceBootstrapCache: WorkspaceBootstrapRaw | null = null;
let workspaceBootstrapCacheAt = 0;
let workspaceBootstrapCacheScopeKey = '';

export const resetWorkspaceBootstrapCache = () => {
  workspaceBootstrapPromise = null;
  workspaceBootstrapCache = null;
  workspaceBootstrapCacheAt = 0;
  workspaceBootstrapCacheScopeKey = '';
};

export const getWorkspaceBootstrap = (scope: WorkspaceScope = getAnonymousWorkspaceScope()) => {
  const scopeKey = scope.kind === 'anonymous' ? 'anonymous' : `user:${scope.userId}`;
  if (
    workspaceBootstrapCache &&
    workspaceBootstrapCacheScopeKey === scopeKey &&
    Date.now() - workspaceBootstrapCacheAt < WORKSPACE_BOOTSTRAP_CACHE_TTL_MS
  ) {
    return Promise.resolve(workspaceBootstrapCache);
  }

  if (!workspaceBootstrapPromise) {
    workspaceBootstrapPromise = loadWorkspaceBootstrap(scope)
      .then((value) => {
        workspaceBootstrapCache = value;
        workspaceBootstrapCacheAt = Date.now();
        workspaceBootstrapCacheScopeKey = scopeKey;
        return value;
      })
      .finally(() => {
        workspaceBootstrapPromise = null;
      });
  }
  return workspaceBootstrapPromise;
};
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';
