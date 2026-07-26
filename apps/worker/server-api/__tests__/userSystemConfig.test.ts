import { describe, expect, it } from 'vitest';
import { getUserSystemConfig } from '../lib/userSystemConfig';

const buildEnv = () =>
  ({
    ASSETS: { fetch: fetch.bind(globalThis) },
    SHARE_KV: {} as KVNamespace,
    USER_DB: {} as D1Database,
    BETTER_AUTH_SECRET: 'better-auth-secret',
    BETTER_AUTH_URL: 'http://localhost:3000',
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM_EMAIL: 'noreply@example.com',
    RESEND_FROM_NAME: 'DDLBuilder',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    SIGNUP_BONUS_CREDITS: '100000',
  }) satisfies Record<string, unknown>;

describe('getUserSystemConfig', () => {
  it('reads required user system config', () => {
    const config = getUserSystemConfig(buildEnv() as never);
    expect(config.signupBonusCredits).toBe(100000);
    expect(config.betterAuthUrl).toContain('localhost');
    expect(config.resendFromEmail).toBe('noreply@example.com');
    expect(config.authRequireEmailVerification).toBe(true);
  });

  it('fails when USER_DB binding is missing', () => {
    const env = buildEnv();
    delete env.USER_DB;
    expect(() => getUserSystemConfig(env as never)).toThrow('USER_DB binding is required');
  });

  it('fails when signup credits are invalid', () => {
    const env = buildEnv();
    env.SIGNUP_BONUS_CREDITS = '0';
    expect(() => getUserSystemConfig(env as never)).toThrow(
      'SIGNUP_BONUS_CREDITS must be a positive integer',
    );
  });

  it('supports disabling email verification in isolated runtimes', () => {
    const env = {
      ...buildEnv(),
      AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
    };
    expect(getUserSystemConfig(env as never).authRequireEmailVerification).toBe(false);
  });

  it('rejects an invalid email verification setting', () => {
    const env = {
      ...buildEnv(),
      AUTH_REQUIRE_EMAIL_VERIFICATION: 'sometimes',
    };
    expect(() => getUserSystemConfig(env as never)).toThrow(
      'AUTH_REQUIRE_EMAIL_VERIFICATION must be true or false',
    );
  });
});
