import { describe, expect, it } from 'vitest';
import { getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';

describe('workspaceScope', () => {
  describe('getWorkspaceScopeStorageKey', () => {
    it('returns user prefixed key for legacy user scope', () => {
      const scope: WorkspaceScope = { kind: 'legacy_user', userId: 'user-123' };
      expect(getWorkspaceScopeStorageKey(scope)).toBe('user:user-123');
    });

    it('includes workspace id for workspace scoped user data', () => {
      const scope: WorkspaceScope = { kind: 'user', userId: 'user-123', workspaceId: 'ws-1' };
      expect(getWorkspaceScopeStorageKey(scope)).toBe('user:user-123:workspace:ws-1');
    });
  });
});
