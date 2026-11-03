import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';

const betterAuthMocks = vi.hoisted(() => ({
  createBetterAuth: vi.fn(),
  handler: vi.fn(),
}));
const requestRateLimitMocks = vi.hoisted(() => ({
  enforceIpRateLimit: vi.fn(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- route behavior is tested independently of Better Auth.
vi.mock('../lib/betterAuth.js', () => ({
  createBetterAuth: betterAuthMocks.createBetterAuth,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- route validation is tested independently of rate-limit policy.
vi.mock('../lib/requestRateLimit.js', () => requestRateLimitMocks);

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  // SAFETY: route tests do not access KV.
  SHARE_KV: {} as KVNamespace,
  // SAFETY: route tests replace database-dependent operations at their module seams.
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

describe('/api/auth/*', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    betterAuthMocks.handler.mockResolvedValue(
      Response.json({
        created: true,
      }),
    );
    betterAuthMocks.createBetterAuth.mockReturnValue({
      handler: betterAuthMocks.handler,
      api: { getSession: vi.fn().mockResolvedValue(null) },
    });
    requestRateLimitMocks.enforceIpRateLimit.mockResolvedValue(null);
  });

  describe('POST /api/auth/sign-up/email', () => {
    it('returns 429 when signup attempts are rate limited', async () => {
      requestRateLimitMocks.enforceIpRateLimit.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Too many signup attempts' }), {
          status: 429,
          headers: { 'retry-after': '300' },
        }),
      );
      const { default: app } = await import('../../api/index');

      const response = await app.fetch(
        createRequest('/api/auth/sign-up/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'password', name: 'Test' }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('300');
      expect(betterAuthMocks.handler).not.toHaveBeenCalled();
    });

    it('uses the configured authentication body limit', async () => {
      const { default: app } = await import('../../api/index');

      const response = await app.fetch(
        createRequest('/api/auth/sign-up/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ padding: 'x'.repeat(128) }),
        }),
        createEnv({ AUTH_BODY_MAX_BYTES: '64' }),
      );

      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
      expect(betterAuthMocks.handler).not.toHaveBeenCalled();
    });

    it('accepts signup without human verification and preserves the registration fields', async () => {
      betterAuthMocks.handler.mockImplementation(async (request: Request) =>
        Response.json({ body: await request.json() }),
      );
      const { default: app } = await import('../../api/index');
      const body = { email: 'test@example.com', password: 'password', name: 'Test' };

      const response = await app.fetch(
        createRequest('/api/auth/sign-up/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        createEnv(),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ body });
    });
  });

  describe('/api/auth/* (better-auth proxy)', () => {
    it.each(['sign-in/email', 'request-password-reset'])(
      'limits native auth endpoint %s before invoking better-auth',
      async (endpoint) => {
        requestRateLimitMocks.enforceIpRateLimit.mockResolvedValue(
          new Response(null, { status: 429 }),
        );
        const { default: app } = await import('../../api/index');

        const response = await app.fetch(
          createRequest(`/api/auth/${endpoint}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          }),
          createEnv(),
        );
        expect(response.status).toBe(429);
        expect(betterAuthMocks.handler).not.toHaveBeenCalled();
      },
    );
  });
});
