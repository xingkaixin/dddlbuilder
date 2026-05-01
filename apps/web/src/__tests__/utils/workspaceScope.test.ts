import { describe, expect, it } from 'vitest';
import {
  getAnonymousWorkspaceScope,
  getWorkspaceScopeStorageKey,
  buildScopedWorkspaceKey,
  getCurrentWorkspaceScope,
  setCurrentWorkspaceScope,
} from '@/utils/workspaceScope';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';

describe('workspaceScope', () => {
  describe('getAnonymousWorkspaceScope', () => {
    it('returns anonymous scope', () => {
      const scope = getAnonymousWorkspaceScope();
      expect(scope).toEqual({ kind: 'anonymous' });
    });

    it('returns same reference on multiple calls', () => {
      const scope1 = getAnonymousWorkspaceScope();
      const scope2 = getAnonymousWorkspaceScope();
      expect(scope1).toBe(scope2);
    });
  });

  describe('getWorkspaceScopeStorageKey', () => {
    it('returns anonymous for anonymous scope', () => {
      const scope: WorkspaceScope = { kind: 'anonymous' };
      expect(getWorkspaceScopeStorageKey(scope)).toBe('anonymous');
    });

    it('returns user prefixed key for user scope', () => {
      const scope: WorkspaceScope = { kind: 'user', userId: 'user-123' };
      expect(getWorkspaceScopeStorageKey(scope)).toBe('user:user-123');
    });

    it('includes workspace id for workspace scoped user data', () => {
      const scope: WorkspaceScope = { kind: 'user', userId: 'user-123', workspaceId: 'ws-1' };
      expect(getWorkspaceScopeStorageKey(scope)).toBe('user:user-123:workspace:ws-1');
    });
  });

  describe('buildScopedWorkspaceKey', () => {
    it('builds key for anonymous scope', () => {
      const scope: WorkspaceScope = { kind: 'anonymous' };
      expect(buildScopedWorkspaceKey(scope, 'workspace')).toBe('anonymous::workspace');
    });

    it('builds key for user scope', () => {
      const scope: WorkspaceScope = { kind: 'user', userId: 'user-123' };
      expect(buildScopedWorkspaceKey(scope, 'workspace')).toBe('user:user-123::workspace');
    });

    it('builds key for workspace scoped user data', () => {
      const scope: WorkspaceScope = { kind: 'user', userId: 'user-123', workspaceId: 'ws-1' };
      expect(buildScopedWorkspaceKey(scope, 'workspace')).toBe(
        'user:user-123:workspace:ws-1::workspace',
      );
    });

    it('builds key with empty key string', () => {
      const scope: WorkspaceScope = { kind: 'anonymous' };
      expect(buildScopedWorkspaceKey(scope, '')).toBe('anonymous::');
    });
  });

  describe('getCurrentWorkspaceScope / setCurrentWorkspaceScope', () => {
    it('returns anonymous scope by default', () => {
      const scope = getCurrentWorkspaceScope();
      expect(scope).toEqual({ kind: 'anonymous' });
    });

    it('sets and gets user scope', () => {
      const userScope: WorkspaceScope = { kind: 'user', userId: 'user-456' };
      setCurrentWorkspaceScope(userScope);
      expect(getCurrentWorkspaceScope()).toBe(userScope);
    });

    it('can switch back to anonymous', () => {
      const userScope: WorkspaceScope = { kind: 'user', userId: 'user-789' };
      setCurrentWorkspaceScope(userScope);
      expect(getCurrentWorkspaceScope()).toBe(userScope);

      setCurrentWorkspaceScope(getAnonymousWorkspaceScope());
      expect(getCurrentWorkspaceScope()).toEqual({ kind: 'anonymous' });
    });
  });
});
