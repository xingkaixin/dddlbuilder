import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';
import type * as BetterAuthModule from '../lib/betterAuth.js';
import type * as CreditsModule from '../lib/credits.js';

const requestRateLimitMocks = vi.hoisted(() => ({
  enforceIpRateLimit: vi.fn(),
  revokeUserSessions: vi.fn(),
}));

const adminAuthMocks = vi.hoisted(() => ({
  createAdminSession: vi.fn(),
  resolveAdminSession: vi.fn(),
  deleteAdminSession: vi.fn(),
}));

type MutablePartial<T> = { -readonly [Key in keyof T]?: T[Key] };

type BetterAuthExports = typeof BetterAuthModule;

type CreditsExports = typeof CreditsModule;

const betterAuthOverrides: MutablePartial<BetterAuthExports> = vi.hoisted(() => ({}));
const creditOverrides: MutablePartial<CreditsExports> = vi.hoisted(() => ({}));
const betterAuthForwarders = vi.hoisted(() => ({ createBetterAuth: vi.fn() }));
const creditForwarders = vi.hoisted(() => ({
  applyCreditMutation: vi.fn(),
  listCreditLedger: vi.fn(),
}));

type CreateBetterAuth = BetterAuthExports['createBetterAuth'];

type ApplyCreditMutation = CreditsExports['applyCreditMutation'];

type ListCreditLedger = CreditsExports['listCreditLedger'];

// oxlint-disable-next-line anti-slop/no-module-mocking -- 限流和会话撤销是 admin 路由的外部副作用边界。
vi.mock('../lib/requestRateLimit.js', () => requestRateLimitMocks);

// oxlint-disable-next-line anti-slop/no-module-mocking -- 只隔离会话撤销副作用，不替换 adminAuth 会话协议。
vi.mock('../lib/auth.js', () => ({ revokeUserSessions: requestRateLimitMocks.revokeUserSessions }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 路由测试控制 adminAuth 的 session 分支，真实签名契约由 adminAuth.test.ts 覆盖。
vi.mock('../lib/adminAuth.js', () => adminAuthMocks);

// oxlint-disable-next-line anti-slop/no-module-mocking -- 仅覆盖密码重置 SDK 调用，其他 Better Auth 行为保留真实实现。
vi.mock('../lib/betterAuth.js', async (importOriginal) => {
  const actual = await importOriginal<BetterAuthExports>();
  betterAuthForwarders.createBetterAuth.mockImplementation(
    (...args: Parameters<CreateBetterAuth>) => {
      const override = betterAuthOverrides.createBetterAuth;

      return override ? override(...args) : actual.createBetterAuth(...args);
    },
  );

  return { ...actual, createBetterAuth: betterAuthForwarders.createBetterAuth };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- 仅覆盖手工充值/ledger 的 HTTP fixture，账本事务由 credits.test.ts 覆盖。
vi.mock('../lib/credits.js', async (importOriginal) => {
  const actual = await importOriginal<CreditsExports>();
  creditForwarders.applyCreditMutation.mockImplementation(
    (...args: Parameters<ApplyCreditMutation>) => {
      const override = creditOverrides.applyCreditMutation;

      return override ? override(...args) : actual.applyCreditMutation(...args);
    },
  );
  creditForwarders.listCreditLedger.mockImplementation((...args: Parameters<ListCreditLedger>) => {
    const override = creditOverrides.listCreditLedger;

    return override ? override(...args) : actual.listCreditLedger(...args);
  });

  return {
    ...actual,
    applyCreditMutation: creditForwarders.applyCreditMutation,
    listCreditLedger: creditForwarders.listCreditLedger,
  };
});

const setAdminAuth = (overrides: Partial<typeof adminAuthMocks> = {}) => {
  adminAuthMocks.createAdminSession.mockReset();
  adminAuthMocks.resolveAdminSession.mockReset();
  adminAuthMocks.deleteAdminSession.mockReset();
  adminAuthMocks.createAdminSession.mockImplementation(async () => ({ success: false }));
  adminAuthMocks.resolveAdminSession.mockResolvedValue(false);
  adminAuthMocks.deleteAdminSession.mockResolvedValue('');
  Object.assign(adminAuthMocks, overrides);
};

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  // SAFETY: these bindings are unused defaults; tests provide concrete fakes when exercised.
  SHARE_KV: {} as KVNamespace,
  // SAFETY: these bindings are unused defaults; tests provide concrete fakes when exercised.
  USER_DB: {} as D1Database,
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
  SIGNUP_BONUS_CREDITS: '100000',
  ADMIN_CONSOLE_PASSWORD: 'admin-secret',
  ADMIN_SESSION_SECRET: '0123456789abcdef0123456789abcdef',
  ...overrides,
});

const createRequest = (path: string, init: RequestInit = {}) =>
  new Request(`http://localhost${path}`, init);

type TestD1 = {
  prepare: ReturnType<typeof vi.fn<(query?: string) => { bind: ReturnType<typeof vi.fn> }>>;
  batch: ReturnType<typeof vi.fn>;
};

type TestD1Fixture = {
  prepare: ReturnType<typeof vi.fn>;
};

const mockD1Results = (results: unknown[]): TestD1 => ({
  prepare: vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue(results[0] ?? null),
      all: vi.fn().mockResolvedValue({ results, success: true }),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
    }),
  }),
  batch: vi.fn().mockResolvedValue([]),
});

const asD1Database = (database: TestD1Fixture): D1Database => {
  // SAFETY: admin route tests only need the prepare/batch calls represented by this D1 fixture.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Cloudflare D1 has platform methods omitted by this focused fixture.
  return database as unknown as D1Database;
};

type DurableObjectFixture = {
  idFromName: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

const asDurableObjectNamespace = (fixture: DurableObjectFixture): DurableObjectNamespace => {
  // SAFETY: this route only uses idFromName/get/fetch; the remaining platform methods are irrelevant here.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the focused fixture omits Cloudflare namespace internals.
  return fixture as unknown as DurableObjectNamespace;
};

type ExecutionContextFixture = {
  waitUntil: ReturnType<typeof vi.fn>;
  passThroughOnException(): void;
};

const asExecutionContext = (fixture: ExecutionContextFixture): ExecutionContext => {
  // SAFETY: Hono only calls waitUntil/passThroughOnException on this execution context fixture.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the focused fixture omits runtime-only context members.
  return fixture as unknown as ExecutionContext;
};

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
    setAdminAuth();

    delete betterAuthOverrides.createBetterAuth;
    delete creditOverrides.applyCreditMutation;
    delete creditOverrides.listCreditLedger;
    requestRateLimitMocks.enforceIpRateLimit.mockResolvedValue(null);
    requestRateLimitMocks.revokeUserSessions.mockResolvedValue(undefined);
  });

  it.each([
    ['disable', { reason: 42 }],
    ['email-verification', { verified: 'true' }],
    ['credits', { amount: 100, note: {} }],
    ['session', null],
  ])('rejects malformed %s input before mutations', async (action, body) => {
    setAdminAuth({
      resolveAdminSession: vi.fn().mockResolvedValue(true),
    });
    const prepare = vi.fn();
    const app = await createAdminApp();
    const path = action === 'session' ? '/api/admin/session' : `/api/admin/users/user-1/${action}`;

    const response = await app.fetch(
      createRequest(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      createEnv({ USER_DB: asD1Database({ prepare }) }),
    );
    expect(response.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it.each([
    ['disable', { reason: 'security' }],
    ['email-verification', { verified: false }],
  ])('revokes sessions through better-auth for admin action %s', async (action, body) => {
    setAdminAuth({
      resolveAdminSession: vi.fn().mockResolvedValue(true),
    });
    const fetchSocket = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const waitUntil = vi.fn();

    const env = createEnv({
      USER_DB: asD1Database(mockD1Results([{ id: 'workspace-1' }])),
      WORKSPACE_YDOC: asDurableObjectNamespace({
        idFromName: vi.fn((id) => id),
        get: vi.fn(() => ({ fetch: fetchSocket })),
      }),
    });
    const app = await createAdminApp();

    const response = await app.fetch(
      createRequest(`/api/admin/users/user-1/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env,
      asExecutionContext({ waitUntil, passThroughOnException() {} }),
    );
    await Promise.all(waitUntil.mock.calls.map(([task]) => task));
    expect(requestRateLimitMocks.revokeUserSessions).toHaveBeenCalledWith(env, 'user-1');
    expect(response.status).toBe(200);
  });

  it.each([
    ['disable', { reason: 'security' }],
    ['email-verification', { verified: false }],
  ])('returns 503 when session revocation fails for admin action %s', async (action, body) => {
    setAdminAuth({
      resolveAdminSession: vi.fn().mockResolvedValue(true),
    });
    requestRateLimitMocks.revokeUserSessions.mockRejectedValue(new Error('kick failed'));
    const app = await createAdminApp();

    const response = await app.fetch(
      createRequest(`/api/admin/users/user-1/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      createEnv({ USER_DB: asD1Database(mockD1Results([{ id: 'user-1' }])) }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Failed to revoke active sessions',
      code: 'SERVICE_UNAVAILABLE',
    });
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
      setAdminAuth({
        createAdminSession: vi.fn().mockResolvedValue({
          success: true,
          setCookie:
            'ddlbuilder_admin_session=token; Path=/api/admin; HttpOnly; SameSite=Lax; Max-Age=14400; Secure',
        }),
        resolveAdminSession: vi.fn(),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn(),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn(),
      });

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
      setAdminAuth({
        createAdminSession: vi.fn().mockResolvedValue({ success: false }),
        resolveAdminSession: vi.fn(),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn(),
        deleteAdminSession: vi
          .fn()
          .mockResolvedValue(
            'ddlbuilder_admin_session=; Path=/api/admin; HttpOnly; SameSite=Lax; Max-Age=0; Secure',
          ),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(false),
      });

      const app = await createAdminApp();
      const response = await app.fetch(createRequest('/api/admin/session'), createEnv());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ authenticated: false });
    });
  });

  // ─── User management ─────────────────────────────────────────────

  describe('GET /api/admin/users', () => {
    it('returns 401 without admin session', async () => {
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(false),
      });

      const app = await createAdminApp();
      const response = await app.fetch(createRequest('/api/admin/users'), createEnv());

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: 'Admin session required',
        code: 'ADMIN_REQUIRED',
      });
    });

    it('returns user list with admin session', async () => {
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

      const app = await createAdminApp();

      const response = await app.fetch(
        createRequest('/api/admin/users', {
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({
          USER_DB: asD1Database(
            mockD1Results([
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
            ]),
          ),
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        users: [
          {
            id: 'user-1',
            name: 'User One',
            email: 'user1@example.com',
            emailVerified: true,
            balance: 5000,
            disabled: false,
          },
          {
            id: 'user-2',
            name: 'User Two',
            email: 'user2@example.com',
            emailVerified: false,
            balance: 10000,
            disabled: true,
          },
        ],
      });
    });

    it('respects limit and offset parameters', async () => {
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

      const d1Mock = mockD1Results([]);
      const app = await createAdminApp();

      const response = await app.fetch(
        createRequest('/api/admin/users?limit=10&offset=20', {
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({ USER_DB: asD1Database(d1Mock) }),
      );

      expect(response.status).toBe(200);
      expect(d1Mock.prepare).toHaveBeenCalled();
      const bindCall = d1Mock.prepare().bind;
      expect(bindCall).toHaveBeenCalledWith(10, 20);
    });
  });

  describe('GET /api/admin/users/:userId', () => {
    it('returns 401 without admin session', async () => {
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(false),
      });

      const app = await createAdminApp();
      const response = await app.fetch(createRequest('/api/admin/users/user-1'), createEnv());

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: 'Admin session required',
        code: 'ADMIN_REQUIRED',
      });
    });

    it('returns user details when found', async () => {
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

      const app = await createAdminApp();

      const response = await app.fetch(
        createRequest('/api/admin/users/user-1', {
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({
          USER_DB: asD1Database(
            mockD1Results([
              {
                id: 'user-1',
                name: 'User One',
                email: 'user1@example.com',
                emailVerified: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                balance: 5000,
                disabled: 0,
                lastActiveAt: 1776247200000,
              },
            ]),
          ),
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        user: {
          id: 'user-1',
          name: 'User One',
          email: 'user1@example.com',
          emailVerified: true,
          balance: 5000,
          disabled: false,
          lastActiveAt: '2026-04-15T10:00:00.000Z',
        },
      });
    });

    it('returns 404 when user not found', async () => {
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

      const app = await createAdminApp();

      const response = await app.fetch(
        createRequest('/api/admin/users/nonexistent', {
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({ USER_DB: asD1Database(mockD1Results([])) }),
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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(false),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

      const app = await createAdminApp();

      const response = await app.fetch(
        createRequest('/api/admin/users/nonexistent/reset-password', {
          method: 'POST',
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({ USER_DB: asD1Database(mockD1Results([])) }),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: 'User not found',
      });
    });

    it('sends reset password email for existing user', async () => {
      const requestPasswordReset = vi.fn().mockResolvedValue({ status: true });
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });
      Object.assign(betterAuthOverrides, {
        createBetterAuth: vi.fn().mockReturnValue({ api: { requestPasswordReset } }),
      });

      const app = await createAdminApp();

      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/reset-password', {
          method: 'POST',
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({
          USER_DB: asD1Database(mockD1Results([{ email: 'user1@example.com', name: 'User One' }])),
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
      expect(requestPasswordReset).toHaveBeenCalledWith({
        body: { email: 'user1@example.com', redirectTo: '/?auth_action=reset-password' },
      });
      const redirectTo = requestPasswordReset.mock.calls[0][0].body.redirectTo;
      expect(new URL(redirectTo, 'http://localhost').searchParams.get('auth_action')).toBe(
        'reset-password',
      );
    });

    it('returns 502 when better-auth throws', async () => {
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });
      Object.assign(betterAuthOverrides, {
        createBetterAuth: vi.fn().mockReturnValue({
          api: { requestPasswordReset: vi.fn().mockRejectedValue(new Error('Network error')) },
        }),
      });

      const app = await createAdminApp();

      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/reset-password', {
          method: 'POST',
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({
          USER_DB: asD1Database(mockD1Results([{ email: 'user1@example.com', name: 'User One' }])),
        }),
      );

      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        error: 'Failed to send reset email',
        code: 'SERVICE_UNAVAILABLE',
      });
    });

    it('returns 502 when better-auth rejects the reset request', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });
      Object.assign(betterAuthOverrides, {
        createBetterAuth: vi.fn().mockReturnValue({
          api: { requestPasswordReset: vi.fn().mockRejectedValue(new Error('rejected')) },
        }),
      });

      const app = await createAdminApp();

      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/reset-password', {
          method: 'POST',
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({
          USER_DB: asD1Database(mockD1Results([{ email: 'user1@example.com', name: 'User One' }])),
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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(false),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
        createEnv({ USER_DB: asD1Database(mockD1Results([])) }),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: 'User not found',
      });
    });

    it('disables user with reason', async () => {
      const d1Mock = mockD1Results([{ id: 'user-1' }]);
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
        createEnv({ USER_DB: asD1Database(d1Mock) }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
      expect(d1Mock.prepare).toHaveBeenCalled();
    });

    it('disables user without reason', async () => {
      const d1Mock = mockD1Results([{ id: 'user-1' }]);
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
        createEnv({ USER_DB: asD1Database(d1Mock) }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
      expect(d1Mock.prepare).toHaveBeenCalled();
    });
  });

  describe('POST /api/admin/users/:userId/enable', () => {
    it('returns 401 without admin session', async () => {
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(false),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

      const app = await createAdminApp();

      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/enable', {
          method: 'POST',
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv({ USER_DB: asD1Database(d1Mock) }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
      expect(d1Mock.prepare).toHaveBeenCalledWith('DELETE FROM admin_user_flags WHERE user_id = ?');
    });
  });

  describe('POST /api/admin/users/:userId/email-verification', () => {
    it('returns 401 without admin session', async () => {
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(false),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
        createEnv({ USER_DB: asD1Database(mockD1Results([])) }),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: 'User not found',
      });
    });

    it('marks user as verified', async () => {
      const d1Mock = mockD1Results([{ id: 'user-1' }]);
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
        createEnv({ USER_DB: asD1Database(d1Mock) }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, emailVerified: true });
      expect(d1Mock.prepare).toHaveBeenCalledWith(
        'UPDATE user SET email_verified = ?, updated_at = ? WHERE id = ?',
      );
    });

    it('marks user as unverified and clears sessions', async () => {
      const d1Mock = mockD1Results([{ id: 'user-1' }]);
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
        createEnv({ USER_DB: asD1Database(d1Mock) }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, emailVerified: false });
      expect(d1Mock.prepare).toHaveBeenCalled();
    });
  });

  // ─── Credits ─────────────────────────────────────────────────────

  describe('POST /api/admin/users/:userId/credits', () => {
    it('returns 401 without admin session', async () => {
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(false),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
        createEnv({ USER_DB: asD1Database(mockD1Results([])) }),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: 'User not found',
      });
    });

    it('grants credits successfully', async () => {
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });
      Object.assign(creditOverrides, {
        applyCreditMutation: vi.fn().mockResolvedValue({
          id: 'ledger-1',
          balanceAfter: 15000,
        }),
        listCreditLedger: vi.fn(),
      });

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
          USER_DB: asD1Database(mockD1Results([{ id: 'user-1' }])),
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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });
      Object.assign(creditOverrides, {
        applyCreditMutation,
        listCreditLedger: vi.fn(),
      });

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
          USER_DB: asD1Database(mockD1Results([{ id: 'user-1' }])),
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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });
      Object.assign(creditOverrides, {
        applyCreditMutation: vi.fn().mockRejectedValue(new Error('Insufficient balance')),
        listCreditLedger: vi.fn(),
      });

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
          USER_DB: asD1Database(mockD1Results([{ id: 'user-1' }])),
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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(false),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });
      Object.assign(creditOverrides, {
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
            createdAt: '2026-04-15T10:00:00.000Z',
          },
        ]),
        applyCreditMutation: vi.fn(),
      });

      const app = await createAdminApp();

      const response = await app.fetch(
        createRequest('/api/admin/users/user-1/credits/ledger', {
          headers: { Cookie: 'ddlbuilder_admin_session=valid-token' },
        }),
        createEnv(),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        items: [
          {
            id: 'ledger-1',
            kind: 'grant',
            amount: 5000,
          },
        ],
      });
    });
  });

  // ─── Usage events ────────────────────────────────────────────────

  describe('GET /api/admin/users/:userId/usage-events', () => {
    it('returns 401 without admin session', async () => {
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(false),
      });

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
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
                    chargedTokens: 150,
                    providerBudgetTokens: null,
                    attemptCount: 1,
                    usageEstimated: 0,
                    status: 'success',
                    errorCode: null,
                    createdAt: 1776247200000,
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
        createEnv({ USER_DB: asD1Database(d1Mock) }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        items: [
          {
            id: 'event-1',
            routeKey: 'POST /api/generate',
            status: 'success',
          },
        ],
        total: 42,
      });
    });

    it('handles events with error codes', async () => {
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });

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
                    chargedTokens: null,
                    providerBudgetTokens: null,
                    attemptCount: 1,
                    usageEstimated: 1,
                    status: 'error',
                    errorCode: 'GENERATION_FAILED',
                    createdAt: 1776250800000,
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
        createEnv({ USER_DB: asD1Database(d1Mock) }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: 'event-2',
            status: 'error',
            errorCode: 'GENERATION_FAILED',
            actualTotalTokens: null,
          }),
        ]),
      });
    });
  });
});
