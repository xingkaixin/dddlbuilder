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
});
