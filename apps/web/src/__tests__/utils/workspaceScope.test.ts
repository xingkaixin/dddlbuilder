import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupMemoryLocalStorage } from '@/__tests__/utils/memoryLocalStorage';
import {
  parseWorkspaceIdentity,
  readWorkspaceIdentity,
  writeWorkspaceIdentity,
  subscribeWorkspaceIdentity,
  WORKSPACE_IDENTITY_KEY,
} from '@/services/workspaceIdentity';
import {
  getAnonymousWorkspaceScope,
  getWorkspaceScopeStorageKey,
  buildScopedWorkspaceKey,
} from '@/utils/workspaceScope';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';

describe('workspaceScope', () => {
  describe('remembered local workspace', () => {
    beforeEach(() => setupMemoryLocalStorage());

    it('stores only the workspace locator and notifies same-tab and cross-tab readers', () => {
      const notify = vi.fn();
      const unsubscribe = subscribeWorkspaceIdentity(notify);
      const scope = { kind: 'user', userId: 'user-a', workspaceId: 'workspace-a' } as const;
      writeWorkspaceIdentity(scope);
      expect(parseWorkspaceIdentity(readWorkspaceIdentity())).toEqual(scope);
      expect(JSON.parse(readWorkspaceIdentity() ?? '{}')).toEqual({
        userId: 'user-a',
        workspaceId: 'workspace-a',
      });
      expect(notify).toHaveBeenCalledOnce();
      writeWorkspaceIdentity(scope);
      expect(notify).toHaveBeenCalledOnce();
      window.dispatchEvent(new StorageEvent('storage', { key: WORKSPACE_IDENTITY_KEY }));
      expect(notify).toHaveBeenCalledTimes(2);
      writeWorkspaceIdentity(null);
      expect(readWorkspaceIdentity()).toBeNull();
      unsubscribe();
    });

    it.each([
      null,
      'null',
      '{}',
      'broken json',
      '{"userId":"","workspaceId":"w"}',
      '{"userId":"u","workspaceId":42}',
    ])('ignores an invalid local identity: %s', (value) => {
      expect(parseWorkspaceIdentity(value)).toBeNull();
    });

    it('falls back safely when browser storage is unavailable', () => {
      vi.mocked(localStorage.getItem).mockImplementation(() => {
        throw new Error('Unavailable');
      });
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('Unavailable');
      });
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(readWorkspaceIdentity()).toBeNull();
      expect(() =>
        writeWorkspaceIdentity({ kind: 'user', userId: 'u', workspaceId: 'w' }),
      ).not.toThrow();
      expect(log).toHaveBeenCalledOnce();
      log.mockRestore();
    });
  });

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

    it('returns user prefixed key for legacy user scope', () => {
      const scope: WorkspaceScope = { kind: 'legacy_user', userId: 'user-123' };
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

    it('builds key for legacy user scope', () => {
      const scope: WorkspaceScope = { kind: 'legacy_user', userId: 'user-123' };
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
});
