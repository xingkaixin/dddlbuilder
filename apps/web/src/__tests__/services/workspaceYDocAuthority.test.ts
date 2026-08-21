import { describe, expect, it } from 'vitest';
import {
  isWorkspaceWriteTargetPending,
  resolveWorkspaceYDocStartupPlan,
} from '@/services/workspaceYDocAuthority';

describe('workspaceYDocAuthority', () => {
  it('builds one startup plan for signed-in workspaces', () => {
    const plan = resolveWorkspaceYDocStartupPlan({
      authStatus: 'signed_in',
      userId: 'user-1',
      workspaceId: 'ws-1',
      legacyMigrationCompleted: false,
    });

    expect(plan).toEqual({
      enabled: true,
      scope: {
        kind: 'user',
        userId: 'user-1',
        workspaceId: 'ws-1',
      },
      steps: ['load-indexeddb-ydoc', 'merge-legacy-indexeddb-snapshot', 'connect-durable-object'],
    });
  });

  it('drops the legacy merge step once the migration has completed', () => {
    const plan = resolveWorkspaceYDocStartupPlan({
      authStatus: 'signed_in',
      userId: 'user-1',
      workspaceId: 'ws-1',
      legacyMigrationCompleted: true,
    });

    expect(plan.enabled && plan.steps).toEqual(['load-indexeddb-ydoc', 'connect-durable-object']);
  });

  it('treats every signed-in state without a loaded Y.Doc as a pending write target', () => {
    expect(
      isWorkspaceWriteTargetPending({ authStatus: 'signed_out', userId: null, localSynced: false }),
    ).toBe(false);
    expect(
      isWorkspaceWriteTargetPending({ authStatus: 'loading', userId: null, localSynced: false }),
    ).toBe(false);
    expect(
      isWorkspaceWriteTargetPending({
        authStatus: 'signed_in',
        userId: 'user-1',
        localSynced: false,
      }),
    ).toBe(true);
    // refreshSession 期间 status 退回 loading，userId 保留，仍然是待定的写入目标
    expect(
      isWorkspaceWriteTargetPending({
        authStatus: 'loading',
        userId: 'user-1',
        localSynced: false,
      }),
    ).toBe(true);
    expect(
      isWorkspaceWriteTargetPending({
        authStatus: 'signed_in',
        userId: 'user-1',
        localSynced: true,
      }),
    ).toBe(false);
  });
});
