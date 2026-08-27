import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';
import { createSqliteD1Database } from './helpers/sqliteD1';
import { resolveAuthenticatedUser } from '../lib/auth.js';

vi.mock('../lib/betterAuth.js', () => ({
  createBetterAuth: () => ({
    handler: async () =>
      Response.json({
        session: { token: 'session-token' },
        user: {
          id: 'user-1',
          email: 'user@example.com',
          emailVerified: true,
          name: 'User One',
        },
      }),
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

  it.each(['200000', '50000'])(
    'preserves an existing grant when the policy becomes %s',
    async (amount) => {
      await resolveAuthenticatedUser(env, new Headers());
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
      resolveAuthenticatedUser(env, new Headers()),
      resolveAuthenticatedUser({ ...env, SIGNUP_BONUS_CREDITS: '200000' }, new Headers()),
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
