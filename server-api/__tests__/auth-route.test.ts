import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  RATE_LIMIT_KV: {} as KVNamespace,
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

describe('/api/me', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns signed out when no access token is provided', async () => {
    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/me'), createEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      signedIn: false,
      user: null,
    });
  });

  it('returns current user when authentication succeeds', async () => {
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      }),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/me', {
        headers: { Cookie: 'session=ok' },
      }),
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      signedIn: true,
      user: {
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      },
    });
  });

  it('returns signed out when session lookup returns null', async () => {
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockResolvedValue(null),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(createRequest('/api/me'), createEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      signedIn: false,
      user: null,
    });
  });
});
