import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../lib/context.js';

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
  it('returns 401 for anonymous current workspace requests', async () => {
    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/workspaces'), createEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'AUTH_REQUIRED' });
  });
});
