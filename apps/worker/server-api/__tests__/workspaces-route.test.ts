import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';
import type * as WorkspaceEntitiesModule from '../lib/workspaceEntities.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  USER_DB: {} as D1Database,
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  SIGNUP_BONUS_CREDITS: '100000',
  ...overrides,
});

const createRequest = (path: string, init: RequestInit = {}) =>
  new Request(`http://localhost${path}`, init);

describe('/api/workspaces', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 401 for anonymous workspace list requests', async () => {
    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/workspaces'), createEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('returns the active workspace for authenticated users', async () => {
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({ userId: 'user-1' }),
    }));
    vi.doMock('../lib/workspaceEntities.js', async (importOriginal) => {
      const actual = await importOriginal<typeof WorkspaceEntitiesModule>();
      return {
        ...actual,
        listWorkspaces: vi.fn().mockResolvedValue({
          activeWorkspaceId: 'ws-1',
          workspaces: [{ id: 'ws-1', name: 'Default Workspace', isDefault: true, updatedAt: 1 }],
        }),
      };
    });

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/workspaces'), createEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      activeWorkspaceId: 'ws-1',
      workspaces: [{ id: 'ws-1', isDefault: true }],
    });
  });

  it('does not expose the retired entity change protocol', async () => {
    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/workspaces/ws-1/changes', { method: 'POST' }),
      createEnv(),
    );

    expect(response.status).toBe(404);
  });
});
