import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';
import type * as WorkspaceEntitiesModule from '../lib/workspaceEntities.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  // SAFETY: workspace route tests do not access KV.
  SHARE_KV: {} as KVNamespace,
  // SAFETY: workspace route tests replace database access at the route seam.
  USER_DB: {} as D1Database,
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
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

  it('returns 401 for anonymous current workspace requests', async () => {
    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/workspaces'), createEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('returns the active workspace for authenticated users', async () => {
    // oxlint-disable-next-line anti-slop/no-module-mocking -- this scenario isolates the authentication boundary.
    vi.doMock('../lib/auth.js', () => ({
      authenticateRequest: vi.fn().mockResolvedValue({ userId: 'user-1' }),
    }));
    // oxlint-disable-next-line anti-slop/no-module-mocking -- this scenario preserves real logic and replaces workspace lookup.
    vi.doMock('../lib/workspaceEntities.js', async (importOriginal) => {
      const actual = await importOriginal<typeof WorkspaceEntitiesModule>();

      return {
        ...actual,
        getCurrentWorkspace: vi.fn().mockResolvedValue({
          workspaceId: 'ws-1',
        }),
      };
    });

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/workspaces'), createEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      workspaceId: 'ws-1',
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
