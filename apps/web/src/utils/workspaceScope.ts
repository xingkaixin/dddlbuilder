import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';

const ANONYMOUS_SCOPE: WorkspaceScope = { kind: 'anonymous' };

export const getAnonymousWorkspaceScope = (): WorkspaceScope => ANONYMOUS_SCOPE;

export const getWorkspaceScopeStorageKey = (scope: WorkspaceScope) =>
  scope.kind === 'anonymous'
    ? 'anonymous'
    : scope.kind === 'legacy_user'
      ? `user:${scope.userId}`
      : `user:${scope.userId}:workspace:${scope.workspaceId}`;

export const buildScopedWorkspaceKey = (scope: WorkspaceScope, key: string) =>
  `${getWorkspaceScopeStorageKey(scope)}::${key}`;
