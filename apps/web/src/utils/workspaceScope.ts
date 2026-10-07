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

// 匿名分区还要读取没有分区前缀的旧 key，只能全量读取。
export const scopedWorkspaceKeyRange = (scope: WorkspaceScope) => {
  if (scope.kind === 'anonymous') return undefined;
  const prefix = buildScopedWorkspaceKey(scope, '');

  return IDBKeyRange.bound(prefix, `${prefix}\uffff`);
};
