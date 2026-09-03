import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import { kickWorkspaceSockets } from '../../lib/sessionRevocation.js';

const createEnv = (
  workspaceIds: string[],
  fetch: (workspaceId: string, input: RequestInfo, init?: RequestInit) => Promise<Response>,
) =>
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

describe('kickWorkspaceSockets', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries transient failures before reporting success', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(new Response(null, { status: 204 }));
    const result = kickWorkspaceSockets(createEnv(['workspace-1'], fetch), {
      userId: 'user-1',
      sessionId: 'session-1',
    });

    await vi.runAllTimersAsync();
    await expect(result).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenLastCalledWith(
      'workspace-1',
      'https://workspace-ydoc.internal/kick',
      expect.objectContaining({
        headers: {
          'x-ddlbuilder-user-id': 'user-1',
          'x-ddlbuilder-session-id': 'session-1',
        },
      }),
    );
  });

  it('waits for every workspace and rejects after retries are exhausted', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetch = vi.fn(async (workspaceId: string) => {
      if (workspaceId === 'workspace-1') return new Response(null, { status: 503 });
      return new Response(null, { status: 204 });
    });
    const result = kickWorkspaceSockets(createEnv(['workspace-1', 'workspace-2'], fetch), {
      userId: 'user-1',
    }).then(
      () => null,
      (error: unknown) => error,
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

  it('rejects when workspaces exist but the Durable Object binding is unavailable', async () => {
    const env = createEnv(['workspace-1'], vi.fn());
    delete env.WORKSPACE_YDOC;

    await expect(kickWorkspaceSockets(env, { userId: 'user-1' })).rejects.toThrow(
      'Workspace socket revocation is unavailable',
    );
  });
});
