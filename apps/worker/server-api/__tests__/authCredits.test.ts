import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';
import { createSqliteD1Database } from './helpers/sqliteD1';
import { resolveAuthenticatedUser } from '../lib/auth.js';
import { grantSignupCredits } from '../lib/credits.js';

vi.mock('../lib/betterAuth.js', () => ({
  createBetterAuth: () => ({
    api: {
      getSession: async () => ({
        session: { id: 'session-1', token: 'session-token' },
        user: {
          id: 'user-1',
          email: 'user@example.com',
          emailVerified: true,
          name: 'User One',
        },
      }),
    },
  }),
}));

describe('authentication credit initialization', () => {
  let fixture: ReturnType<typeof createSqliteD1Database>;
  let env: ApiEnv['Bindings'];

  beforeEach(() => {
    fixture = createSqliteD1Database({ includeMeta: true });
    fixture.sqlite
      .prepare(
        'INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 1)',
      )
      .run('user-1', 'User One', 'user@example.com');
    fixture.sqlite
      .prepare(
        'INSERT INTO session (id,token,user_id,expires_at,created_at,updated_at) VALUES (?, ?, ?, ?, 1, 1)',
      )
      .run('session-1', 'token', 'user-1', Date.now() + 60000);
    env = {
      USER_DB: fixture.database,
      BETTER_AUTH_SECRET: 'test-secret',
      BETTER_AUTH_URL: 'http://localhost:3000',
      RESEND_API_KEY: 'test-key',
      RESEND_FROM_EMAIL: 'noreply@example.com',
      TURNSTILE_SECRET_KEY: 'test-key',
      SIGNUP_BONUS_CREDITS: '100000',
    } as ApiEnv['Bindings'];
  });

  afterEach(() => fixture.sqlite.close());

  it('repairs a missing signup grant when reading the balance', async () => {
    const { Hono } = await import('hono');
    const { registerCreditRoutes } = await import('../routes/credits.js');
    await expect(
      grantSignupCredits(
        { ...env, SIGNUP_BONUS_CREDITS: 'invalid' },
        { userId: 'user-1', email: 'user@example.com' },
      ),
    ).rejects.toThrow(/SIGNUP_BONUS_CREDITS/);
    const app = new Hono<ApiEnv>();
    registerCreditRoutes(app);
    const response = await app.request('/credits/balance', {}, env);
    const body = await response.json();
    expect(body.balance).toBe(100000);
  });

  it.each(['200000', '50000'])(
    'preserves an existing grant when the policy becomes %s',
    async (amount) => {
      await grantSignupCredits(env, { userId: 'user-1', email: 'user@example.com' });
      const result = resolveAuthenticatedUser(
        { ...env, SIGNUP_BONUS_CREDITS: amount },
        new Headers(),
      );
      await expect(result).resolves.toMatchObject({ userId: 'user-1' });
      expect(fixture.sqlite.prepare('SELECT balance, version FROM credit_accounts').get()).toEqual({
        balance: 100000,
        version: 1,
      });
      expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM credit_ledger').get()).toEqual({
        count: 1,
      });
    },
  );

  it('initializes a new user once under concurrent policies', async () => {
    const results = await Promise.allSettled([
      grantSignupCredits(env, { userId: 'user-1', email: 'user@example.com' }),
      grantSignupCredits(
        { ...env, SIGNUP_BONUS_CREDITS: '200000' },
        { userId: 'user-1', email: 'user@example.com' },
      ),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    const ledger = fixture.sqlite.prepare('SELECT amount, balance_after FROM credit_ledger').all();
    expect(ledger).toHaveLength(1);
    expect([100000, 200000]).toContain(ledger[0].amount);
    expect(fixture.sqlite.prepare('SELECT balance FROM credit_accounts').get()?.balance).toBe(
      ledger[0].amount,
    );
  });
});
