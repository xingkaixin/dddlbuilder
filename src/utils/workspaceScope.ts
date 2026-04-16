import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';

const ANONYMOUS_SCOPE: WorkspaceScope = { kind: 'anonymous' };

let currentWorkspaceScope: WorkspaceScope = ANONYMOUS_SCOPE;

export const getAnonymousWorkspaceScope = (): WorkspaceScope => ANONYMOUS_SCOPE;

export const getWorkspaceScopeStorageKey = (scope: WorkspaceScope) =>
  scope.kind === 'anonymous' ? 'anonymous' : `user:${scope.userId}`;

export const buildScopedWorkspaceKey = (scope: WorkspaceScope, key: string) =>
  `${getWorkspaceScopeStorageKey(scope)}::${key}`;

export const getCurrentWorkspaceScope = () => currentWorkspaceScope;

export const setCurrentWorkspaceScope = (scope: WorkspaceScope) => {
  currentWorkspaceScope = scope;
};
