import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../lib/context';
import { getUserSystemConfig } from '../lib/userSystemConfig';

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
    SIGNUP_BONUS_CREDITS: '100000',
  });

const asBindings = <T extends object>(env: T): ApiEnv['Bindings'] => {
  // SAFETY: each fixture supplies the environment keys required by the specific configuration assertion.
  return env as never;
};

describe('getUserSystemConfig', () => {
  it('rejects an invalid email verification setting', () => {
    const env = {
      ...buildEnv(),
      AUTH_REQUIRE_EMAIL_VERIFICATION: 'sometimes',
    };
    expect(() => getUserSystemConfig(asBindings(env))).toThrow(
      'AUTH_REQUIRE_EMAIL_VERIFICATION must be true or false',
    );
  });
});
