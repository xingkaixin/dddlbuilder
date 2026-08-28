import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';

const requestRateLimitMocks = vi.hoisted(() => ({
  enforceIpRateLimit: vi.fn(),
}));

vi.mock('../lib/requestRateLimit.js', () => requestRateLimitMocks);

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
  ADMIN_CONSOLE_PASSWORD: 'admin-secret',
  ...overrides,
});

const createRequest = (path: string, init: RequestInit = {}) =>
  new Request(`http://localhost${path}`, init);

const mockD1Results = (results: unknown[]) => ({
  prepare: vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue(results[0] ?? null),
      all: vi.fn().mockResolvedValue({ results, success: true }),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
    }),
  }),
  batch: vi.fn().mockResolvedValue([]),
});

const createAdminApp = async () => {
  const { registerAdminRoutes } = await import('../routes/admin.js');
  const { DomainError, errorResponse } = await import('../lib/http.js');
  const app = new Hono<ApiEnv>().basePath('/api');
  app.onError((error, c) => {
    if (error instanceof DomainError) {
      return errorResponse(c, error.status, error.message, error.code);
    }
    console.error('[api] unhandled error', error);
    return errorResponse(c, 503, 'Service unavailable', 'SERVICE_UNAVAILABLE');
  });
  registerAdminRoutes(app);
  return app;
};

describe('/api/admin/*', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requestRateLimitMocks.enforceIpRateLimit.mockResolvedValue(null);
  });

  // ─── Session management ──────────────────────────────────────────

  describe('POST /api/admin/session', () => {
    it('returns 429 after the admin login limit is exhausted', async () => {
      requestRateLimitMocks.enforceIpRateLimit.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Too many admin login attempts',
            code: 'RATE_LIMIT_EXCEEDED',
            requestId: 'test-request-id',
          }),
          {
            status: 429,
            headers: {
              'content-type': 'application/json',
              'retry-after': '600',
            },
          },
        ),
      );
      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: 'admin-secret' }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('600');
      expect(await response.json()).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
    });

    it('creates session with valid password', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn().mockResolvedValue({
          success: true,
          setCookie:
            'ddlbuilder_admin_session=token; Path=/api/admin; HttpOnly; SameSite=Lax; Max-Age=14400; Secure',
        }),
        resolveAdminSession: vi.fn(),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: 'admin-secret' }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(response.headers.get('Set-Cookie')).toContain('ddlbuilder_admin_session');
    });

    it('returns 400 when password is empty', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn(),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: '' }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: 'Password is required',
        code: 'ADMIN_REQUIRED',
      });
    });

    it('returns 400 when password is missing', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn(),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }),
        createEnv(),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: 'Password is required',
        code: 'ADMIN_REQUIRED',
      });
    });

    it('returns 401 when password is invalid', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn().mockResolvedValue({ success: false }),
        resolveAdminSession: vi.fn(),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: 'wrong-password' }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: 'Invalid admin password',
        code: 'ADMIN_REQUIRED',
      });
    });
  });

  describe('DELETE /api/admin/session', () => {
    it('deletes admin session and clears cookie', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn(),
        deleteAdminSession: vi
          .fn()
          .mockResolvedValue(
            'ddlbuilder_admin_session=; Path=/api/admin; HttpOnly; SameSite=Lax; Max-Age=0; Secure',
          ),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/session', { method: 'DELETE' }),
        createEnv(),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });
  });

  describe('GET /api/admin/session', () => {
    it('returns authenticated true when session is valid', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/session', {
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv(),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ authenticated: true });
    });

    it('returns authenticated false when session is invalid', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(false),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(createRequest('/api/admin/session'), createEnv());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ authenticated: false });
    });
  });

  // ─── User management ─────────────────────────────────────────────

  describe('GET /api/admin/users', () => {
    it('returns 401 without admin session', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(false),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(createRequest('/api/admin/users'), createEnv());

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: 'Admin session required',
        code: 'ADMIN_REQUIRED',
      });
    });

    it('returns user list with admin session', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users', {
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({
          USER_DB: mockD1Results([
            {
              id: 'user-1',
              name: 'User One',
              email: 'user1@example.com',
              emailVerified: 1,
              createdAt: Date.now(),
              balance: 5000,
              disabled: 0,
            },
            {
              id: 'user-2',
              name: 'User Two',
              email: 'user2@example.com',
              emailVerified: 0,
              createdAt: Date.now(),
              balance: 10000,
              disabled: 1,
            },
          ]) as unknown as D1Database,
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.users).toHaveLength(2);
      expect(body.users[0]).toMatchObject({
        id: 'user-1',
        name: 'User One',
        email: 'user1@example.com',
        emailVerified: true,
        balance: 5000,
        disabled: false,
      });
      expect(body.users[1]).toMatchObject({
        id: 'user-2',
        name: 'User Two',
        email: 'user2@example.com',
        emailVerified: false,
        balance: 10000,
        disabled: true,
      });
    });

    it('respects limit and offset parameters', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const d1Mock = mockD1Results([]);
      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users?limit=10&offset=20', {
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({ USER_DB: d1Mock as unknown as D1Database }),
      );

      expect(response.status).toBe(200);
      expect(d1Mock.prepare).toHaveBeenCalled();
      const bindCall = d1Mock.prepare().bind;
      expect(bindCall).toHaveBeenCalledWith(10, 20);
    });
  });

  describe('GET /api/admin/users/:userId', () => {
    it('returns 401 without admin session', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(false),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(createRequest('/api/admin/users/user-1'), createEnv());

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: 'Admin session required',
        code: 'ADMIN_REQUIRED',
      });
    });

    it('returns user details when found', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1', {
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({
          USER_DB: mockD1Results([
            {
              id: 'user-1',
              name: 'User One',
              email: 'user1@example.com',
              emailVerified: 1,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              balance: 5000,
              disabled: 0,
              lastActiveAt: '2026-04-15T10:00:00Z',
            },
          ]) as unknown as D1Database,
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.user).toMatchObject({
        id: 'user-1',
        name: 'User One',
        email: 'user1@example.com',
        emailVerified: true,
        balance: 5000,
        disabled: false,
        lastActiveAt: '2026-04-15T10:00:00Z',
      });
    });

    it('returns 404 when user not found', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/nonexistent', {
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({ USER_DB: mockD1Results([]) as unknown as D1Database }),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: 'User not found',
      });
    });
  });

  // ─── User actions ────────────────────────────────────────────────

  describe('POST /api/admin/users/:userId/reset-password', () => {
    it('returns 401 without admin session', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(false),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/reset-password', { method: 'POST' }),
        createEnv(),
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: 'Admin session required',
        code: 'ADMIN_REQUIRED',
      });
    });

    it('returns 404 when user not found', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/nonexistent/reset-password', {
          method: 'POST',
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({ USER_DB: mockD1Results([]) as unknown as D1Database }),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: 'User not found',
      });
    });

    it('sends reset password email for existing user', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));
      vi.doMock('../lib/betterAuth.js', () => ({
        createBetterAuth: vi.fn().mockReturnValue({ handler: mockHandler }),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/reset-password', {
          method: 'POST',
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({
          USER_DB: mockD1Results([
            { email: 'user1@example.com', name: 'User One' },
          ]) as unknown as D1Database,
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
      expect(mockHandler).toHaveBeenCalled();
    });

    it('returns 500 when better-auth throws', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));
      vi.doMock('../lib/betterAuth.js', () => ({
        createBetterAuth: vi.fn().mockReturnValue({
          handler: vi.fn().mockRejectedValue(new Error('Network error')),
        }),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/reset-password', {
          method: 'POST',
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({
          USER_DB: mockD1Results([
            { email: 'user1@example.com', name: 'User One' },
          ]) as unknown as D1Database,
        }),
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({
        error: 'Failed to send reset email',
        code: 'SERVICE_UNAVAILABLE',
      });
    });

    it('returns 502 when better-auth rejects the reset request', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));
      vi.doMock('../lib/betterAuth.js', () => ({
        createBetterAuth: vi.fn().mockReturnValue({
          handler: vi.fn().mockResolvedValue(new Response('rejected', { status: 400 })),
        }),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/reset-password', {
          method: 'POST',
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({
          USER_DB: mockD1Results([
            { email: 'user1@example.com', name: 'User One' },
          ]) as unknown as D1Database,
        }),
      );

      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        error: 'Failed to send reset email',
        code: 'SERVICE_UNAVAILABLE',
      });
    });
  });

  describe('POST /api/admin/users/:userId/disable', () => {
    it('returns 401 without admin session', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(false),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/disable', { method: 'POST' }),
        createEnv(),
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: 'Admin session required',
        code: 'ADMIN_REQUIRED',
      });
    });

    it('returns 404 when user not found', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/nonexistent/disable', {
          method: 'POST',
          headers: {
            Cookie: 'ddlbuilder_admin_session=valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ reason: 'test' }),
        }),
        createEnv({ USER_DB: mockD1Results([]) as unknown as D1Database }),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: 'User not found',
      });
    });

    it('disables user with reason', async () => {
      const d1Mock = mockD1Results([{ id: 'user-1' }]);
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/disable', {
          method: 'POST',
          headers: {
            Cookie: 'ddlbuilder_admin_session=valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ reason: 'Spam activity' }),
        }),
        createEnv({ USER_DB: d1Mock as unknown as D1Database }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
      expect(d1Mock.batch).toHaveBeenCalled();
    });

    it('disables user without reason', async () => {
      const d1Mock = mockD1Results([{ id: 'user-1' }]);
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/disable', {
          method: 'POST',
          headers: {
            Cookie: 'ddlbuilder_admin_session=valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({}),
        }),
        createEnv({ USER_DB: d1Mock as unknown as D1Database }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
      expect(d1Mock.batch).toHaveBeenCalled();
    });
  });

  describe('POST /api/admin/users/:userId/enable', () => {
    it('returns 401 without admin session', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(false),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/enable', { method: 'POST' }),
        createEnv(),
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: 'Admin session required',
        code: 'ADMIN_REQUIRED',
      });
    });

    it('enables user by removing flags', async () => {
      const d1Mock = mockD1Results([]);
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/enable', {
          method: 'POST',
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({ USER_DB: d1Mock as unknown as D1Database }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
      expect(d1Mock.prepare).toHaveBeenCalledWith('DELETE FROM admin_user_flags WHERE user_id = ?');
    });
  });

  describe('POST /api/admin/users/:userId/email-verification', () => {
    it('returns 401 without admin session', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(false),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/email-verification', { method: 'POST' }),
        createEnv(),
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: 'Admin session required',
        code: 'ADMIN_REQUIRED',
      });
    });

    it('returns 400 when verified is not a boolean', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/email-verification', {
          method: 'POST',
          headers: {
            Cookie: 'ddlbuilder_admin_session=valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ verified: 'true' }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: 'Verified flag must be a boolean',
      });
    });

    it('returns 404 when user not found', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/email-verification', {
          method: 'POST',
          headers: {
            Cookie: 'ddlbuilder_admin_session=valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ verified: true }),
        }),
        createEnv({ USER_DB: mockD1Results([]) as unknown as D1Database }),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: 'User not found',
      });
    });

    it('marks user as verified', async () => {
      const d1Mock = mockD1Results([{ id: 'user-1' }]);
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/email-verification', {
          method: 'POST',
          headers: {
            Cookie: 'ddlbuilder_admin_session=valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ verified: true }),
        }),
        createEnv({ USER_DB: d1Mock as unknown as D1Database }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, emailVerified: true });
      expect(d1Mock.prepare).toHaveBeenCalledWith(
        'UPDATE user SET email_verified = 1, updated_at = ? WHERE id = ?',
      );
    });

    it('marks user as unverified and clears sessions', async () => {
      const d1Mock = mockD1Results([{ id: 'user-1' }]);
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/email-verification', {
          method: 'POST',
          headers: {
            Cookie: 'ddlbuilder_admin_session=valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ verified: false }),
        }),
        createEnv({ USER_DB: d1Mock as unknown as D1Database }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, emailVerified: false });
      expect(d1Mock.batch).toHaveBeenCalled();
    });
  });

  // ─── Credits ─────────────────────────────────────────────────────

  describe('POST /api/admin/users/:userId/credits', () => {
    it('returns 401 without admin session', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(false),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/credits', { method: 'POST' }),
        createEnv(),
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: 'Admin session required',
        code: 'ADMIN_REQUIRED',
      });
    });

    it('returns 400 when amount is not positive', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/credits', {
          method: 'POST',
          headers: {
            Cookie: 'ddlbuilder_admin_session=valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ amount: -100 }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: 'Amount must be a positive safe integer',
      });
    });

    it('returns 400 when amount is zero', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/credits', {
          method: 'POST',
          headers: {
            Cookie: 'ddlbuilder_admin_session=valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ amount: 0 }),
        }),
        createEnv(),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: 'Amount must be a positive safe integer',
      });
    });

    it('returns 400 when amount is not a safe integer', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      for (const amount of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
        const response = await app.fetch(
          createRequest('/api/admin/users/user-1/credits', {
            method: 'POST',
            headers: {
              Cookie: 'ddlbuilder_admin_session=valid-token',
              'content-type': 'application/json',
            },
            body: JSON.stringify({ amount }),
          }),
          createEnv(),
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          error: 'Amount must be a positive safe integer',
        });
      }
    });

    it('returns 404 when user not found', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/nonexistent/credits', {
          method: 'POST',
          headers: {
            Cookie: 'ddlbuilder_admin_session=valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ amount: 1000 }),
        }),
        createEnv({ USER_DB: mockD1Results([]) as unknown as D1Database }),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: 'User not found',
      });
    });

    it('grants credits successfully', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));
      vi.doMock('../lib/credits.js', () => ({
        applyCreditMutation: vi.fn().mockResolvedValue({
          id: 'ledger-1',
          balanceAfter: 15000,
        }),
        listCreditLedger: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/credits', {
          method: 'POST',
          headers: {
            Cookie: 'ddlbuilder_admin_session=valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ amount: 5000, note: 'Bonus credits' }),
        }),
        createEnv({
          USER_DB: mockD1Results([{ id: 'user-1' }]) as unknown as D1Database,
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        newBalance: 15000,
      });
    });

    it('passes Idempotency-Key header through to the credit ledger', async () => {
      const applyCreditMutation = vi.fn().mockResolvedValue({
        id: 'ledger-1',
        balanceAfter: 15000,
      });
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));
      vi.doMock('../lib/credits.js', () => ({
        applyCreditMutation,
        listCreditLedger: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/credits', {
          method: 'POST',
          headers: {
            Cookie: 'ddlbuilder_admin_session=valid-token',
            'content-type': 'application/json',
            'Idempotency-Key': 'retry-token-1',
          },
          body: JSON.stringify({ amount: 5000 }),
        }),
        createEnv({
          USER_DB: mockD1Results([{ id: 'user-1' }]) as unknown as D1Database,
        }),
      );

      expect(response.status).toBe(200);
      expect(applyCreditMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          idempotencyKey: 'admin_grant:user-1:retry-token-1',
        }),
      );
    });

    it('returns 503 without leaking internal error when credit operation fails', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));
      vi.doMock('../lib/credits.js', () => ({
        applyCreditMutation: vi.fn().mockRejectedValue(new Error('Insufficient balance')),
        listCreditLedger: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/credits', {
          method: 'POST',
          headers: {
            Cookie: 'ddlbuilder_admin_session=valid-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ amount: 5000 }),
        }),
        createEnv({
          USER_DB: mockD1Results([{ id: 'user-1' }]) as unknown as D1Database,
        }),
      );

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: 'Service unavailable',
      });
    });
  });

  describe('GET /api/admin/users/:userId/credits/ledger', () => {
    it('returns 401 without admin session', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(false),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/credits/ledger'),
        createEnv(),
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: 'Admin session required',
        code: 'ADMIN_REQUIRED',
      });
    });

    it('returns credit ledger for user', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));
      vi.doMock('../lib/credits.js', () => ({
        listCreditLedger: vi.fn().mockResolvedValue([
          {
            id: 'ledger-1',
            userId: 'user-1',
            kind: 'grant',
            source: 'manual_adjustment',
            amount: 5000,
            balanceAfter: 15000,
            idempotencyKey: 'admin_grant:user-1:uuid',
            relatedUsageId: null,
            metadataJson: '{"adminAction":"manual_credit_grant"}',
            createdAt: '2026-04-15T10:00:00Z',
          },
        ]),
        applyCreditMutation: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/credits/ledger', {
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv(),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        id: 'ledger-1',
        kind: 'grant',
        amount: 5000,
      });
    });
  });

  // ─── Usage events ────────────────────────────────────────────────

  describe('GET /api/admin/users/:userId/usage-events', () => {
    it('returns 401 without admin session', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(false),
        deleteAdminSession: vi.fn(),
      }));

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/usage-events'),
        createEnv(),
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: 'Admin session required',
        code: 'ADMIN_REQUIRED',
      });
    });

    it('returns usage events with pagination', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const d1Mock = {
        prepare: vi.fn().mockImplementation((sql: string) => {
          const isCount = sql.includes('COUNT(*)');
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(isCount ? { total: 42 } : null),
              all: vi.fn().mockResolvedValue({
                results: [
                  {
                    id: 'event-1',
                    routeKey: 'POST /api/generate',
                    requestId: 'req-1',
                    estimatedTokens: 100,
                    actualTotalTokens: 150,
                    status: 'success',
                    errorCode: null,
                    createdAt: '2026-04-15T10:00:00Z',
                  },
                ],
                success: true,
              }),
              run: vi.fn().mockResolvedValue({ success: true }),
            }),
          };
        }),
        batch: vi.fn().mockResolvedValue([]),
      };

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/usage-events?limit=10&offset=5', {
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({ USER_DB: d1Mock as unknown as D1Database }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        id: 'event-1',
        routeKey: 'POST /api/generate',
        status: 'success',
      });
      expect(body.total).toBe(42);
    });

    it('handles events with error codes', async () => {
      vi.doMock('../lib/adminAuth.js', () => ({
        createAdminSession: vi.fn(),
        resolveAdminSession: vi.fn().mockResolvedValue(true),
        deleteAdminSession: vi.fn(),
      }));

      const d1Mock = {
        prepare: vi.fn().mockImplementation((sql: string) => {
          const isCount = sql.includes('COUNT(*)');
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(isCount ? { total: 1 } : null),
              all: vi.fn().mockResolvedValue({
                results: [
                  {
                    id: 'event-2',
                    routeKey: 'POST /api/generate',
                    requestId: 'req-2',
                    estimatedTokens: 200,
                    actualTotalTokens: null,
                    status: 'error',
                    errorCode: 'GENERATION_FAILED',
                    createdAt: '2026-04-15T11:00:00Z',
                  },
                ],
                success: true,
              }),
              run: vi.fn().mockResolvedValue({ success: true }),
            }),
          };
        }),
        batch: vi.fn().mockResolvedValue([]),
      };

      const app = await createAdminApp();
      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/usage-events', {
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({ USER_DB: d1Mock as unknown as D1Database }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.items[0]).toMatchObject({
        id: 'event-2',
        status: 'error',
        errorCode: 'GENERATION_FAILED',
        actualTotalTokens: null,
      });
    });
  });
});
