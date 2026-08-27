import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';

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

describe('createBetterAuth', () => {
  const betterAuthMock = vi.fn();
  const drizzleAdapterMock = vi.fn();
  const drizzleMock = vi.fn(() => ({ db: 'mocked' }));
  const resendSendMock = vi.fn();
  class MockResend {
    emails = { send: resendSendMock };
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resendSendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    vi.doMock('better-auth', () => ({
      betterAuth: betterAuthMock,
    }));
    vi.doMock('better-auth/adapters/drizzle', () => ({
      drizzleAdapter: drizzleAdapterMock.mockReturnValue({ adapter: 'drizzle' }),
    }));
    vi.doMock('drizzle-orm/d1', () => ({
      drizzle: drizzleMock,
    }));
    vi.doMock('resend', () => ({
      Resend: MockResend,
    }));
  });

  it('calls betterAuth with correct config including trustedOrigins from default allowed origins', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv();

    createBetterAuth(env);

    expect(betterAuthMock).toHaveBeenCalledTimes(1);
    const config = betterAuthMock.mock.calls[0][0];

    expect(config.secret).toBe('better-auth-secret');
    expect(config.baseURL).toBe('http://localhost:3000');
    expect(config.trustedOrigins).toContain('http://localhost:3000');
    expect(config.trustedOrigins).toContain('http://localhost:5173');
    expect(config.trustedOrigins).toContain('http://127.0.0.1:5173');
    expect(config.database).toEqual({ adapter: 'drizzle' });
    expect(config.emailAndPassword.enabled).toBe(true);
    expect(config.emailAndPassword.requireEmailVerification).toBe(true);
    expect(config.emailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
    expect(config.emailVerification.sendOnSignUp).toBe(true);
    expect(config.emailVerification.sendOnSignIn).toBe(false);
    expect(config.emailVerification.autoSignInAfterVerification).toBe(true);
  });

  it('parses single CORS_ALLOWED_ORIGINS and includes it in trustedOrigins', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv({ CORS_ALLOWED_ORIGINS: 'https://app.example.com' });

    createBetterAuth(env);

    const config = betterAuthMock.mock.calls[0][0];
    expect(config.trustedOrigins).toContain('https://app.example.com');
    expect(config.trustedOrigins).toContain('http://localhost:3000');
  });

  it('parses multiple comma-separated CORS_ALLOWED_ORIGINS', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv({
      CORS_ALLOWED_ORIGINS: 'https://a.com, https://b.com ,https://c.com',
    });

    createBetterAuth(env);

    const config = betterAuthMock.mock.calls[0][0];
    expect(config.trustedOrigins).toContain('https://a.com');
    expect(config.trustedOrigins).toContain('https://b.com');
    expect(config.trustedOrigins).toContain('https://c.com');
    expect(config.trustedOrigins).toContain('http://localhost:3000');
  });

  it('falls back to default origins when CORS_ALLOWED_ORIGINS is empty string', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv({ CORS_ALLOWED_ORIGINS: '' });

    createBetterAuth(env);

    const config = betterAuthMock.mock.calls[0][0];
    expect(config.trustedOrigins).toContain('http://localhost:5173');
    expect(config.trustedOrigins).toContain('http://127.0.0.1:5173');
  });

  it('falls back to default origins when CORS_ALLOWED_ORIGINS is whitespace only', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv({ CORS_ALLOWED_ORIGINS: '   ' });

    createBetterAuth(env);

    const config = betterAuthMock.mock.calls[0][0];
    expect(config.trustedOrigins).toContain('http://localhost:5173');
    expect(config.trustedOrigins).toContain('http://127.0.0.1:5173');
  });

  it('filters out empty items from comma-separated origins', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv({ CORS_ALLOWED_ORIGINS: 'https://a.com,, ,https://b.com' });

    createBetterAuth(env);

    const config = betterAuthMock.mock.calls[0][0];
    expect(config.trustedOrigins).toContain('https://a.com');
    expect(config.trustedOrigins).toContain('https://b.com');
    expect(config.trustedOrigins).not.toContain('');
  });

  it('uses drizzleAdapter with sqlite provider and betterAuthSchema', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv();

    createBetterAuth(env);

    expect(drizzleMock).toHaveBeenCalledWith(env.USER_DB);
    expect(drizzleAdapterMock).toHaveBeenCalledWith(
      { db: 'mocked' },
      { provider: 'sqlite', schema: expect.anything() },
    );
  });

  it('sendResetPassword sends email via Resend with correct content', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv();

    createBetterAuth(env);
    const config = betterAuthMock.mock.calls[0][0];

    const user = { email: 'user@example.com', name: 'Test User' };
    const url = 'https://example.com/reset?token=abc';
    await config.emailAndPassword.sendResetPassword({ user, url });

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const sent = resendSendMock.mock.calls[0][0];
    expect(sent.to).toBe('user@example.com');
    expect(sent.from).toBe('DDLBuilder <noreply@example.com>');
    expect(sent.subject).toBe('重置你的筑表师密码');
    expect(sent.html).toContain('Test User');
    expect(sent.html).toContain('https://example.com/reset?token=abc');
    expect(sent.text).toBe(
      'Test User，请打开这个链接重置密码：https://example.com/reset?token=abc',
    );
  });

  it.each([
    ['emailVerification', 'sendVerificationEmail'],
    ['emailAndPassword', 'sendResetPassword'],
  ])('%s propagates a provider error returned without rejecting', async (section, method) => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    createBetterAuth(createEnv());
    const config = betterAuthMock.mock.calls[0][0];
    resendSendMock.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 },
    });

    const outcome = await config[section]
      [method]({
        user: { email: 'user@example.com', name: 'Test User' },
        url: 'https://example.com/verify?token=secret',
      })
      .then(
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

  it('sendResetPassword falls back to email when name is empty', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv();

    createBetterAuth(env);
    const config = betterAuthMock.mock.calls[0][0];

    const user = { email: 'user@example.com', name: '' };
    const url = 'https://example.com/reset?token=abc';
    await config.emailAndPassword.sendResetPassword({ user, url });

    const sent = resendSendMock.mock.calls[0][0];
    expect(sent.html).toContain('user@example.com');
    expect(sent.text).toBe(
      'user@example.com，请打开这个链接重置密码：https://example.com/reset?token=abc',
    );
  });

  it('sendVerificationEmail sends email via Resend with correct content', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv();

    createBetterAuth(env);
    const config = betterAuthMock.mock.calls[0][0];

    const user = { email: 'user@example.com', name: 'Test User' };
    const url = 'https://example.com/verify?token=xyz';
    await config.emailVerification.sendVerificationEmail({ user, url });

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const sent = resendSendMock.mock.calls[0][0];
    expect(sent.to).toBe('user@example.com');
    expect(sent.from).toBe('DDLBuilder <noreply@example.com>');
    expect(sent.subject).toBe('验证你的筑表师账号');
    expect(sent.html).toContain('Test User');
    expect(sent.html).toContain('https://example.com/verify?token=xyz');
    expect(sent.text).toBe(
      'Test User，请打开这个链接完成邮箱验证：https://example.com/verify?token=xyz',
    );
  });

  it('sendVerificationEmail falls back to email when name is empty', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv();

    createBetterAuth(env);
    const config = betterAuthMock.mock.calls[0][0];

    const user = { email: 'user@example.com', name: '' };
    const url = 'https://example.com/verify?token=xyz';
    await config.emailVerification.sendVerificationEmail({ user, url });

    const sent = resendSendMock.mock.calls[0][0];
    expect(sent.html).toContain('user@example.com');
    expect(sent.text).toBe(
      'user@example.com，请打开这个链接完成邮箱验证：https://example.com/verify?token=xyz',
    );
  });

  it('normalizes relative verification URLs into absolute HTTPS URLs', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv({
      BETTER_AUTH_URL: 'https://ddl.xingkaixin.me/api/auth',
    });

    createBetterAuth(env);
    const config = betterAuthMock.mock.calls[0][0];

    const user = { email: 'user@example.com', name: 'Test User' };
    const url = '/api/auth/verify-email?token=xyz';
    await config.emailVerification.sendVerificationEmail({ user, url });

    const sent = resendSendMock.mock.calls[0][0];
    expect(sent.html).toContain('https://ddl.xingkaixin.me/api/auth/verify-email?token=xyz');
    expect(sent.text).toContain('https://ddl.xingkaixin.me/api/auth/verify-email?token=xyz');
  });

  it('normalizes scheme-less verification URLs into absolute HTTPS URLs', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv({
      BETTER_AUTH_URL: 'https://ddl.xingkaixin.me/api/auth',
    });

    createBetterAuth(env);
    const config = betterAuthMock.mock.calls[0][0];

    const user = { email: 'user@example.com', name: 'Test User' };
    const url = 'ddl.xingkaixin.me/api/auth/verify-email?token=xyz';
    await config.emailVerification.sendVerificationEmail({ user, url });

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
    await config.emailVerification.sendVerificationEmail({ user, url });

    const sent = resendSendMock.mock.calls[0][0];
    expect(sent.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(sent.html).toContain('&lt;&gt;&amp;&quot;&#39;');
    expect(sent.text).toContain('<script>alert("xss")</script>');
  });

  it('email layout contains brand name and footer', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv();

    createBetterAuth(env);
    const config = betterAuthMock.mock.calls[0][0];

    const user = { email: 'user@example.com', name: 'User' };
    const url = 'https://example.com/verify';
    await config.emailVerification.sendVerificationEmail({ user, url });

    const sent = resendSendMock.mock.calls[0][0];
    expect(sent.html).toContain('筑表师');
    expect(sent.html).toContain('DDLBuilder');
    expect(sent.html).toContain('此邮件由 筑表师 (DDLBuilder) 自动发送');
  });

  it('deduplicates trustedOrigins when authBaseUrl matches an allowed origin', async () => {
    const { createBetterAuth } = await import('../../lib/betterAuth.js');
    const env = createEnv({
      BETTER_AUTH_URL: 'http://localhost:5173',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
    });

    createBetterAuth(env);

    const config = betterAuthMock.mock.calls[0][0];
    const originSet = new Set(config.trustedOrigins);
    expect(originSet.size).toBe(config.trustedOrigins.length);
    expect(config.trustedOrigins.filter((o: string) => o === 'http://localhost:5173').length).toBe(
      1,
    );
  });
});
