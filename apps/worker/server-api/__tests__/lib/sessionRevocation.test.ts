import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import { revokeSessionActivity } from '../../lib/sessionRevocation.js';

const createEnv = (
  workspaceIds: string[],
  fetch: (workspaceId: string, input: RequestInfo, init?: RequestInit) => Promise<Response>,
) =>
  // SAFETY: The revocation tests implement exactly the USER_DB and Durable Object methods called by revokeSessionActivity.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- this fixture intentionally omits unrelated Worker bindings.
  ({
    USER_DB: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: workspaceIds.map((id) => ({ id })) }),
        }),
      }),
    },
    WORKSPACE_YDOC: {
      idFromName: (workspaceId: string) => workspaceId,
      get: (workspaceId: string) => ({
        fetch: (input: RequestInfo, init?: RequestInit) => fetch(workspaceId, input, init),
      }),
    },
  }) as unknown as ApiEnv['Bindings'];

describe('revokeSessionActivity', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('waits for every workspace and rejects after retries are exhausted', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const fetch = vi.fn(async (workspaceId: string) => {
      if (workspaceId === 'workspace-1') return new Response(null, { status: 503 });

      return new Response(null, { status: 204 });
    });
    const result = revokeSessionActivity(createEnv(['workspace-1', 'workspace-2'], fetch), {
      userId: 'user-1',
    }).then(
      () => null,
      (error: Error) => error,
    );

    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({
      message: 'Workspace socket revocation failed for 1 workspace(s)',
    });

    expect(fetch.mock.calls.filter(([workspaceId]) => workspaceId === 'workspace-1')).toHaveLength(
      3,
    );
    expect(fetch.mock.calls.filter(([workspaceId]) => workspaceId === 'workspace-2')).toHaveLength(
      1,
    );
  });
});
