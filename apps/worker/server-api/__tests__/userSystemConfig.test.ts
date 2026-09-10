import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../lib/context';
import { getAuthBodyMaxBytes, getUserSystemConfig } from '../lib/userSystemConfig';

const buildEnv = () =>
  // SAFETY: the fixture object supplies every configuration key read by the parser; platform bindings are only placeholders.
  ({
    ASSETS: { fetch: fetch.bind(globalThis) },
    // SAFETY: configuration tests never call KV; the empty object is an unused platform placeholder.
    SHARE_KV: {} as KVNamespace,
    // SAFETY: configuration tests only inspect environment strings; the empty D1 object is never called.
    USER_DB: {} as D1Database,
    BETTER_AUTH_SECRET: 'better-auth-secret',
    BETTER_AUTH_URL: 'http://localhost:3000',
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM_EMAIL: 'noreply@example.com',
    RESEND_FROM_NAME: 'DDLBuilder',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    SIGNUP_BONUS_CREDITS: '100000',
  });

const asBindings = <T extends object>(env: T): ApiEnv['Bindings'] => {
  // SAFETY: each fixture supplies the environment keys required by the specific configuration assertion.
  return env as never;
};

describe('getUserSystemConfig', () => {
  it('reads required user system config', () => {
    const config = getUserSystemConfig(asBindings(buildEnv()));
    expect(config.signupBonusCredits).toBe(100000);
    expect(config.betterAuthUrl).toContain('localhost');
    expect(config.resendFromEmail).toBe('noreply@example.com');
    expect(config.authRequireEmailVerification).toBe(true);
  });

  it('fails when USER_DB binding is missing', () => {
    const env: Partial<ReturnType<typeof buildEnv>> = buildEnv();
    delete env.USER_DB;
    expect(() => getUserSystemConfig(asBindings(env))).toThrow('USER_DB binding is required');
  });

  it('fails when signup credits are invalid', () => {
    const env = buildEnv();
    env.SIGNUP_BONUS_CREDITS = '0';
    expect(() => getUserSystemConfig(asBindings(env))).toThrow(
      'SIGNUP_BONUS_CREDITS must be a positive integer',
    );
  });

  it('supports disabling email verification in isolated runtimes', () => {
    const env = {
      ...buildEnv(),
      AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
    };
    expect(getUserSystemConfig(asBindings(env)).authRequireEmailVerification).toBe(false);
  });

  it('rejects an invalid email verification setting', () => {
    const env = {
      ...buildEnv(),
      AUTH_REQUIRE_EMAIL_VERIFICATION: 'sometimes',
    };
    expect(() => getUserSystemConfig(asBindings(env))).toThrow(
      'AUTH_REQUIRE_EMAIL_VERIFICATION must be true or false',
    );
  });

  it('defaults and supports a bounded authentication body limit', () => {
    expect(getAuthBodyMaxBytes(asBindings(buildEnv()))).toBe(16 * 1024);

    const env = {
      ...buildEnv(),
      AUTH_BODY_MAX_BYTES: '32768',
    };
    expect(getAuthBodyMaxBytes(asBindings(env))).toBe(32768);
  });

  it.each(['0', '1.5', '1048577'])('rejects an unsafe authentication body limit: %s', (value) => {
    const env = {
      ...buildEnv(),
      AUTH_BODY_MAX_BYTES: value,
    };
    expect(() => getAuthBodyMaxBytes(asBindings(env))).toThrow('AUTH_BODY_MAX_BYTES');
  });
});
