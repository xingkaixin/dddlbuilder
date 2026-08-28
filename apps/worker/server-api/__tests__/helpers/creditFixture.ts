import type { ApiEnv } from '../../lib/context.js';
import { applyCreditMutation, getCreditAccount } from '../../lib/credits.js';
import { reserveAIUsage } from '../../lib/aiUsage.js';
import { createSqliteD1Database } from './sqliteD1.js';

export const createCreditFixture = async (balance = 1000) => {
  const { database, sqlite } = createSqliteD1Database({ includeMeta: true });
  const env = { USER_DB: database } as ApiEnv['Bindings'];
  sqlite
    .prepare('INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, 1, 1)')
    .run('user-1', 'User', 'user@example.com');
  await applyCreditMutation(env, {
    userId: 'user-1',
    kind: 'grant',
    source: 'signup_bonus',
    amount: balance,
    idempotencyKey: 'signup_bonus:user-1',
  });
  const reserve = (estimatedTokens = 100, requestId = 'request-1') =>
    reserveAIUsage(env, {
      userId: 'user-1',
      routeKey: 'explain',
      requestId,
      estimatedTokens,
    });
  return {
    env,
    sqlite,
    reserve,
    balance: async () => (await getCreditAccount(env, 'user-1'))?.balance,
  };
};
