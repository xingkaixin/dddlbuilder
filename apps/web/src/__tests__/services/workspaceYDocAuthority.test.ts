import { describe, expect, it } from 'vitest';
import {
  resolveWorkspaceYDocStartupPlan,
  shouldQueueWorkspaceEntityOutbox,
} from '@/services/workspaceYDocAuthority';

describe('workspaceYDocAuthority', () => {
  it('builds one startup plan for signed-in workspaces', () => {
    const plan = resolveWorkspaceYDocStartupPlan({
      authStatus: 'signed_in',
      userId: 'user-1',
      workspaceId: 'ws-1',
    });

    expect(plan).toEqual({
      enabled: true,
      scope: {
        kind: 'user',
        userId: 'user-1',
        workspaceId: 'ws-1',
      },
      steps: ['load-indexeddb-ydoc', 'merge-legacy-indexeddb-snapshot', 'connect-durable-object'],
      d1Persistence: 'durable-object-checkpoint',
      queueEntityOutbox: false,
    });
  });

  it('queues entity outbox only before the Y.Doc runtime path is active', () => {
    const scope = {
      kind: 'user' as const,
      userId: 'user-1',
      workspaceId: 'ws-1',
    };

    expect(shouldQueueWorkspaceEntityOutbox({ scope, yDocReady: false })).toBe(true);
    expect(shouldQueueWorkspaceEntityOutbox({ scope, yDocReady: true })).toBe(false);
    expect(
      shouldQueueWorkspaceEntityOutbox({ scope: { kind: 'anonymous' }, yDocReady: false }),
    ).toBe(false);
  });
});
