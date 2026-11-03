import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';
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

type CreditsExports = typeof CreditsModule;

const creditOverrides: MutablePartial<CreditsExports> = vi.hoisted(() => ({}));
const creditForwarders = vi.hoisted(() => ({
  applyCreditMutation: vi.fn(),
}));

type ApplyCreditMutation = CreditsExports['applyCreditMutation'];

// oxlint-disable-next-line anti-slop/no-module-mocking -- 限流和会话撤销是 admin 路由的外部副作用边界。
vi.mock('../lib/requestRateLimit.js', () => requestRateLimitMocks);

// oxlint-disable-next-line anti-slop/no-module-mocking -- 只隔离会话撤销副作用，不替换 adminAuth 会话协议。
vi.mock('../lib/auth.js', () => ({ revokeUserSessions: requestRateLimitMocks.revokeUserSessions }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 路由测试控制 adminAuth 的 session 分支，真实签名契约由 adminAuth.test.ts 覆盖。
vi.mock('../lib/adminAuth.js', () => adminAuthMocks);

// oxlint-disable-next-line anti-slop/no-module-mocking -- 仅覆盖手工充值/ledger 的 HTTP fixture，账本事务由 credits.test.ts 覆盖。
vi.mock('../lib/credits.js', async (importOriginal) => {
  const actual = await importOriginal<CreditsExports>();
  creditForwarders.applyCreditMutation.mockImplementation(
    (...args: Parameters<ApplyCreditMutation>) => {
      const override = creditOverrides.applyCreditMutation;

      return override ? override(...args) : actual.applyCreditMutation(...args);
    },
  );

  return {
    ...actual,
    applyCreditMutation: creditForwarders.applyCreditMutation,
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

    delete creditOverrides.applyCreditMutation;
    requestRateLimitMocks.enforceIpRateLimit.mockResolvedValue(null);
    requestRateLimitMocks.revokeUserSessions.mockResolvedValue(undefined);
  });

  it.each([
    ['disable', { reason: 42 }],
    ['credits', { amount: 100, note: {} }],
  ])('rejects malformed %s input before mutations', async (action, body) => {
    setAdminAuth({
      resolveAdminSession: vi.fn().mockResolvedValue(true),
    });
    const prepare = vi.fn();
    const app = await createAdminApp();
    const path = `/api/admin/users/user-1/${action}`;

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

  it.each([['disable', { reason: 'security' }]])(
    'returns 503 when session revocation fails for admin action %s',
    async (action, body) => {
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
    },
  );

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
  });

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
  });

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

    it('passes Idempotency-Key header through to the credit ledger', async () => {
      const applyCreditMutation = vi.fn().mockResolvedValue({
        id: 'ledger-1',
        balanceAfter: 15000,
      });
      setAdminAuth({
        resolveAdminSession: vi.fn().mockResolvedValue(true),
      });
      Object.assign(creditOverrides, { applyCreditMutation });

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
  });
});
