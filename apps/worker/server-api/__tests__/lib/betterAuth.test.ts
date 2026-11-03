import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  // SAFETY: the Better Auth tests never access KV; an empty object satisfies the unused platform binding.
  SHARE_KV: {} as KVNamespace,
  // SAFETY: this minimal D1 double implements the prepare/bind/first calls exercised by createBetterAuth.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- SAFETY: prepare, bind, and first are the complete database surface exercised by this test.
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
  SIGNUP_BONUS_CREDITS: '100000',
  ...overrides,
});

describe('createBetterAuth', () => {
  const betterAuthMock = vi.fn();
  const drizzleAdapterMock = vi.fn();
  const drizzleMock = vi.fn(() => ({ db: 'mocked' }));
  const resendSendMock = vi.fn();
  const grantSignupCreditsMock = vi.fn();

  class MockResend {
    emails = { send: resendSendMock };
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resendSendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    // oxlint-disable-next-line anti-slop/no-module-mocking -- isolate the external Better Auth factory to inspect its generated config
    vi.doMock('better-auth', () => ({
      betterAuth: betterAuthMock,
    }));
    // oxlint-disable-next-line anti-slop/no-module-mocking -- replace the external Drizzle adapter while testing Better Auth wiring
    vi.doMock('better-auth/adapters/drizzle', () => ({
      drizzleAdapter: drizzleAdapterMock.mockReturnValue({ adapter: 'drizzle' }),
    }));
    // oxlint-disable-next-line anti-slop/no-module-mocking -- replace the external D1 Drizzle factory to inspect adapter configuration
    vi.doMock('drizzle-orm/d1', () => ({
      drizzle: drizzleMock,
    }));
    // oxlint-disable-next-line anti-slop/no-module-mocking -- replace the external email SDK to verify notification wiring
    vi.doMock('resend', () => ({
      Resend: MockResend,
    }));
    // oxlint-disable-next-line anti-slop/no-module-mocking -- isolate the credit side effect while testing Better Auth lifecycle hooks
    vi.doMock('../../lib/credits.js', () => ({ grantSignupCredits: grantSignupCreditsMock }));
  });

  it('reuses auth instances for the same bindings and owns signup grants', async () => {
    betterAuthMock.mockReturnValue({ api: {} });
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv();
    createBetterAuth(env);
    createBetterAuth({ ...env });
    const config = betterAuthMock.mock.calls[0][0];
    expect(betterAuthMock).toHaveBeenCalledTimes(1);
    expect(config.databaseHooks.user.create.after).toBeTypeOf('function');
    await config.databaseHooks.user.create.after({ id: 'user-1', email: 'user@example.com' });
    expect(grantSignupCreditsMock).toHaveBeenCalledExactlyOnceWith(env, {
      userId: 'user-1',
      email: 'user@example.com',
    });
  });

  it.each([
    ['otp', 'sendVerificationOTP'],
    ['emailAndPassword', 'sendResetPassword'],
  ])('%s propagates a provider error returned without rejecting', async (section, method) => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    createBetterAuth(createEnv());
    const config = betterAuthMock.mock.calls[0][0];
    resendSendMock.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 },
    });

    const sender = section === 'otp' ? config.plugins[0].options : config[section];

    const outcome = await sender[method]({
      email: 'user@example.com',
      otp: '123456',
      type: 'email-verification',
      user: { email: 'user@example.com', name: 'Test User' },
      url: 'https://example.com/verify?token=secret',
    }).then(
      () => ({ status: 'resolved' }),
      (error: Error) => ({ status: 'rejected', message: error.message }),
    );
    console.info('authentication email provider rejection', { section, outcome });

    expect(outcome).toEqual({
      status: 'rejected',
      message: 'Authentication email delivery failed',
    });
    expect(resendSendMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes relative password reset URLs into absolute HTTPS URLs', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');

    const env = createEnv({
      BETTER_AUTH_URL: 'https://ddl.xingkaixin.me/api/auth',
    });

    createBetterAuth(env);
    const config = betterAuthMock.mock.calls[0][0];

    const user = { email: 'user@example.com', name: 'Test User' };
    const url = '/api/auth/verify-email?token=xyz';
    await config.emailAndPassword.sendResetPassword({ user, url });

    const sent = resendSendMock.mock.calls[0][0];
    expect(sent.html).toContain('https://ddl.xingkaixin.me/api/auth/verify-email?token=xyz');
    expect(sent.text).toContain('https://ddl.xingkaixin.me/api/auth/verify-email?token=xyz');
  });

  it('escapes HTML special characters in email content', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv();

    createBetterAuth(env);
    const config = betterAuthMock.mock.calls[0][0];

    const user = { email: 'user@example.com', name: '<script>alert("xss")</script>' };
    const url = 'https://example.com/verify?token=<>&"\'';
    await config.emailAndPassword.sendResetPassword({ user, url });

    const sent = resendSendMock.mock.calls[0][0];
    expect(sent.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(sent.html).toContain('&lt;&gt;&amp;&quot;&#39;');
    expect(sent.text).toContain('<script>alert("xss")</script>');
  });
});
