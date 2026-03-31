import {
  migrateLegacyWorkspaceFromLocalStorage,
  readWorkspaceBootstrap,
} from '@/utils/workspaceStateDb';

export type WorkspaceBootstrapRaw = {
  globalDraft: unknown;
  session: unknown;
  savedTable: unknown;
};

const WORKSPACE_BOOTSTRAP_CACHE_TTL_MS = 50;

const loadWorkspaceBootstrap = async (): Promise<WorkspaceBootstrapRaw> => {
  const initial = await readWorkspaceBootstrap().catch(() => ({
    globalDraft: null,
    session: null,
    savedTable: null,
  }));

  if (initial.globalDraft || initial.session) {
    return initial;
  }

  await migrateLegacyWorkspaceFromLocalStorage().catch(() => undefined);
  return readWorkspaceBootstrap().catch(() => ({
    globalDraft: null,
    session: null,
    savedTable: null,
  }));
};

let workspaceBootstrapPromise: Promise<WorkspaceBootstrapRaw> | null = null;
let workspaceBootstrapCache: WorkspaceBootstrapRaw | null = null;
let workspaceBootstrapCacheAt = 0;

export const resetWorkspaceBootstrapCache = () => {
  workspaceBootstrapPromise = null;
  workspaceBootstrapCache = null;
  workspaceBootstrapCacheAt = 0;
};

export const getWorkspaceBootstrap = () => {
  if (
    workspaceBootstrapCache &&
    Date.now() - workspaceBootstrapCacheAt < WORKSPACE_BOOTSTRAP_CACHE_TTL_MS
  ) {
    return Promise.resolve(workspaceBootstrapCache);
  }

  if (!workspaceBootstrapPromise) {
    workspaceBootstrapPromise = loadWorkspaceBootstrap()
      .then((value) => {
        workspaceBootstrapCache = value;
        workspaceBootstrapCacheAt = Date.now();
        return value;
      })
      .finally(() => {
        workspaceBootstrapPromise = null;
      });
  }
  return workspaceBootstrapPromise;
};
