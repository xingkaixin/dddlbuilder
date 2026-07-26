import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';
import type { ApiEnv } from '../lib/context.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  USER_DB: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      }),
    }),
  } as unknown as D1Database,
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  SIGNUP_BONUS_CREDITS: '100000',
  ...overrides,
});

describe('resolveAuthenticatedUser', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('应通过 Better Auth handler 的 get-session 路由读取当前用户', async () => {
    const handler = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          session: {
            token: 'session-token',
          },
          user: {
            id: 'user-1',
            email: 'user@example.com',
            emailVerified: true,
            name: 'User One',
          },
        }),
      ),
    );

    vi.doMock('../lib/betterAuth.js', () => ({
      createBetterAuth: vi.fn(() => ({
        handler,
      })),
    }));
    vi.doMock('../lib/credits.js', () => ({
      ensureCreditAccount: vi.fn(),
      applyCreditMutation: vi.fn(),
    }));

    const { resolveAuthenticatedUser } = await import('../lib/auth.js');
    const user = await resolveAuthenticatedUser(
      createEnv(),
      new Headers({
        cookie: 'better-auth.session_token=test',
      }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    const request = handler.mock.calls[0]?.[0] as Request;
    expect(request.url).toContain('/api/auth/get-session?disableRefresh=true');
    expect(request.headers.get('cookie')).toContain('better-auth.session_token=');
    expect(user).toMatchObject({
      userId: 'user-1',
      email: 'user@example.com',
    });
  });

  it('当 get-session 返回非 ok 时抛出错误', async () => {
    const handler = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));

    vi.doMock('../lib/betterAuth.js', () => ({
      createBetterAuth: vi.fn(() => ({
        handler,
      })),
    }));

    const { resolveAuthenticatedUser } = await import('../lib/auth.js');
    await expect(
      resolveAuthenticatedUser(createEnv(), new Headers({ cookie: 'session=test' })),
    ).rejects.toThrow('FAILED_TO_GET_SESSION');
  });

  it('当 session 中没有 user 时返回 null', async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ session: { token: 'token' } })));

    vi.doMock('../lib/betterAuth.js', () => ({
      createBetterAuth: vi.fn(() => ({
        handler,
      })),
    }));

    const { resolveAuthenticatedUser } = await import('../lib/auth.js');
    const user = await resolveAuthenticatedUser(createEnv(), new Headers());
    expect(user).toBeNull();
  });

  it('当 session 返回无效 JSON 时返回 null', async () => {
    const handler = vi.fn().mockResolvedValue(new Response('invalid-json'));

    vi.doMock('../lib/betterAuth.js', () => ({
      createBetterAuth: vi.fn(() => ({
        handler,
      })),
    }));

    const { resolveAuthenticatedUser } = await import('../lib/auth.js');
    const user = await resolveAuthenticatedUser(createEnv(), new Headers());
    expect(user).toBeNull();
  });

  it('当用户被禁用时抛出错误', async () => {
    const handler = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          session: { token: 'token' },
          user: {
            id: 'user-1',
            email: 'user@example.com',
            emailVerified: true,
            name: 'User One',
          },
        }),
      ),
    );

    vi.doMock('../lib/betterAuth.js', () => ({
      createBetterAuth: vi.fn(() => ({
        handler,
      })),
    }));

    const { resolveAuthenticatedUser } = await import('../lib/auth.js');
    const env = createEnv({
      USER_DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ user_id: 'user-1' }),
          }),
        }),
      } as unknown as D1Database,
    });

    await expect(
      resolveAuthenticatedUser(env, new Headers({ cookie: 'session=test' })),
    ).rejects.toThrow('USER_DISABLED');
  });
});

describe('authenticateRequest', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('当用户未认证时抛出错误', async () => {
    vi.doMock('../lib/betterAuth.js', () => ({
      createBetterAuth: vi.fn(() => ({
        handler: vi.fn().mockResolvedValue(new Response(JSON.stringify(null))),
      })),
    }));

    const { authenticateRequest } = await import('../lib/auth.js');
    const mockContext = {
      env: createEnv(),
      req: { raw: { headers: new Headers() } },
      set: vi.fn(),
    } as unknown as Context<ApiEnv>;

    await expect(authenticateRequest(mockContext)).rejects.toThrow('AUTH_REQUIRED');
  });

  it('当认证成功时设置 currentUserId 并返回用户', async () => {
    vi.doMock('../lib/betterAuth.js', () => ({
      createBetterAuth: vi.fn(() => ({
        handler: vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              session: { token: 'token' },
              user: {
                id: 'user-1',
                email: 'user@example.com',
                emailVerified: true,
                name: 'User One',
              },
            }),
          ),
        ),
      })),
    }));
    vi.doMock('../lib/credits.js', () => ({
      ensureCreditAccount: vi.fn(),
      applyCreditMutation: vi.fn(),
    }));

    const { authenticateRequest } = await import('../lib/auth.js');
    const mockSet = vi.fn();
    const mockContext = {
      env: createEnv(),
      req: { raw: { headers: new Headers({ cookie: 'session=test' }) } },
      set: mockSet,
    } as unknown as Context<ApiEnv>;

    const user = await authenticateRequest(mockContext);
    expect(user).toMatchObject({ userId: 'user-1' });
    expect(mockSet).toHaveBeenCalledWith('currentUserId', 'user-1');
  });
});
