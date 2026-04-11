import { describe, expect, it } from 'vitest';
import { getUserSystemConfig } from '../lib/userSystemConfig';

const buildEnv = () =>
  ({
    ASSETS: { fetch: fetch.bind(globalThis) },
    SHARE_KV: {} as KVNamespace,
    RATE_LIMIT_KV: {} as KVNamespace,
    USER_DB: {} as D1Database,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    SIGNUP_BONUS_CREDITS: '100000',
  }) satisfies Record<string, unknown>;

describe('getUserSystemConfig', () => {
  it('reads required user system config', () => {
    const config = getUserSystemConfig(buildEnv() as never);
    expect(config.signupBonusCredits).toBe(100000);
    expect(config.supabaseUrl).toContain('supabase.co');
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
});
