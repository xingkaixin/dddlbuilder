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

describe('/api/auth/*', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('POST /api/auth/turnstile/verify', () => {
    it('returns 400 when JSON body is invalid', async () => {
      const { default: app } = await import('../../api/index');
      const response = await app.fetch(
        createRequest('/api/auth/turnstile/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: 'not-json',
        }),
        createEnv(),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: 'Invalid JSON body',
        code: 'INVALID_JSON',
      });
    });

    it('returns 400 when token is missing', async () => {
      const { default: app } = await import('../../api/index');
      const response = await app.fetch(
        createRequest('/api/auth/turnstile/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }),
        createEnv(),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: 'Turnstile token is required',
        code: 'TURNSTILE_REQUIRED',
      });
    });

    it('returns 400 when token is empty string', async () => {
      const { default: app } = await import('../../api/index');
      const response = await app.fetch(
        createRequest('/api/auth/turnstile/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: '   ' }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: 'Turnstile token is required',
        code: 'TURNSTILE_REQUIRED',
      });
    });

    it('returns 400 when token is not a string', async () => {
      const { default: app } = await import('../../api/index');
      const response = await app.fetch(
        createRequest('/api/auth/turnstile/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: 12345 }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: 'Turnstile token is required',
        code: 'TURNSTILE_REQUIRED',
      });
    });

    it('returns 400 when token is null', async () => {
      const { default: app } = await import('../../api/index');
      const response = await app.fetch(
        createRequest('/api/auth/turnstile/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: null }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: 'Turnstile token is required',
        code: 'TURNSTILE_REQUIRED',
      });
    });

    it('returns 503 when turnstile service returns non-ok', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        }),
      );

      const { default: app } = await import('../../api/index');
      const response = await app.fetch(
        createRequest('/api/auth/turnstile/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: 'valid-token' }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: 'Turnstile service unavailable',
        code: 'SERVICE_UNAVAILABLE',
      });

      vi.unstubAllGlobals();
    });

    it('returns 403 when turnstile verification fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            success: false,
            'error-codes': ['timeout-or-duplicate'],
          }),
        }),
      );

      const { default: app } = await import('../../api/index');
      const response = await app.fetch(
        createRequest('/api/auth/turnstile/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: 'valid-token' }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: 'Turnstile verification failed',
        code: 'TURNSTILE_FAILED',
      });

      vi.unstubAllGlobals();
    });

    it('returns success when turnstile verification passes', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            success: true,
          }),
        }),
      );

      const { default: app } = await import('../../api/index');
      const response = await app.fetch(
        createRequest('/api/auth/turnstile/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: 'valid-token' }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        success: true,
      });

      vi.unstubAllGlobals();
    });

    it('includes remoteip when cf-connecting-ip header is present', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { default: app } = await import('../../api/index');
      await app.fetch(
        createRequest('/api/auth/turnstile/verify', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'cf-connecting-ip': '192.168.1.1',
          },
          body: JSON.stringify({ token: 'valid-token' }),
        }),
        createEnv(),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('remoteip'),
        }),
      );

      vi.unstubAllGlobals();
    });
  });

  describe('/api/auth/* (better-auth proxy)', () => {
    it('proxies requests to better-auth handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      vi.doMock('../lib/betterAuth.js', () => ({
        createBetterAuth: vi.fn().mockReturnValue({ handler: mockHandler }),
      }));

      const { default: app } = await import('../../api/index');
      const response = await app.fetch(
        createRequest('/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('proxies GET requests to better-auth handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ providers: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      vi.doMock('../lib/betterAuth.js', () => ({
        createBetterAuth: vi.fn().mockReturnValue({ handler: mockHandler }),
      }));

      const { default: app } = await import('../../api/index');
      const response = await app.fetch(createRequest('/api/auth/providers'), createEnv());

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });
  });
});

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

  it('returns 503 when authentication service throws', async () => {
    vi.doMock('../lib/auth.js', () => ({
      resolveAuthenticatedUser: vi.fn().mockRejectedValue(new Error('DB down')),
    }));

    const { default: app } = await import('../../api/index');
    const response = await app.fetch(
      createRequest('/api/me', {
        headers: { Cookie: 'session=ok' },
      }),
      createEnv(),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: 'Authentication service unavailable',
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
