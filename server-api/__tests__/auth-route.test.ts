import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  RATE_LIMIT_KV: {} as KVNamespace,
  USER_DB: {} as D1Database,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
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
      readBearerToken: () => 'test-token',
      authenticateAccessToken: vi.fn().mockResolvedValue({
        appUserId: 'supabase_user-1',
        externalUserId: 'user-1',
        email: 'user@example.com',
        status: 'active',
      }),
      isInvalidJwtError: () => false,
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/me', {
        headers: {
          Authorization: 'Bearer test-token',
        },
      }),
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      signedIn: true,
      user: {
        appUserId: 'supabase_user-1',
        externalUserId: 'user-1',
        email: 'user@example.com',
      },
    });
  });

  it('returns 401 when access token is invalid', async () => {
    vi.doMock('../lib/auth.js', () => ({
      readBearerToken: () => 'bad-token',
      authenticateAccessToken: vi.fn().mockRejectedValue(new Error('bad token')),
      isInvalidJwtError: () => true,
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/me', {
        headers: {
          Authorization: 'Bearer bad-token',
        },
      }),
      createEnv(),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'INVALID_AUTH_TOKEN',
    });
  });
});
