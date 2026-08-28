import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import { failAIUsage, reclaimStaleAIUsage, reserveAIUsage } from '../../lib/aiUsage.js';
import { applyCreditMutation, getCreditAccount } from '../../lib/credits.js';
import { reconcileTerminalAIBudgets, reserveAIDailyBudget } from '../../lib/aiBudget.js';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';

const fixture = async () => {
  const { database, sqlite } = createSqliteD1Database({ includeMeta: true });
  const env = { USER_DB: database } as ApiEnv['Bindings'];
  sqlite
    .prepare('INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('user-1', 'User', 'user@example.com', 1, 1);
  await applyCreditMutation(env, {
    userId: 'user-1',
    kind: 'grant',
    source: 'signup_bonus',
    amount: 1000,
    idempotencyKey: 'signup',
  });
  const reservation = await reserveAIUsage(env, {
    userId: 'user-1',
    routeKey: 'explain',
    requestId: 'request-1',
    estimatedTokens: 100,
  });
  return { env, sqlite, reservation };
};

describe('AI settlement regressions', () => {
  it('charges measured usage even when local response processing fails', async () => {
    const { env, sqlite, reservation } = await fixture();
    try {
      await reserveAIDailyBudget(env, reservation.usageEventId, 100, 1000);
      await failAIUsage(env, reservation, 'UPSTREAM_OPENAI_ERROR', 60);
      await reconcileTerminalAIBudgets(env);
      const balance = (await getCreditAccount(env, 'user-1'))?.balance;
      const usage = sqlite.prepare('SELECT status, actual_total_tokens FROM usage_events').get();
      const budget = sqlite
        .prepare('SELECT actual_tokens, created_at FROM ai_budget_reservations')
        .get();
      expect(balance).toBe(940);
      expect(usage).toMatchObject({ status: 'failed', actual_total_tokens: 60 });
      expect(budget).toMatchObject({ actual_tokens: 60 });
      expect(Number(budget?.created_at)).toBeGreaterThan(0);
    } finally {
      sqlite.close();
    }
  });

  it.each(['reserved', 'pending'])('reclaims %s using durable execution facts', async (status) => {
    const { env, sqlite, reservation } = await fixture();
    try {
      sqlite
        .prepare('UPDATE usage_events SET status = ?, created_at = 1 WHERE id = ?')
        .run(status, reservation.usageEventId);
      await reclaimStaleAIUsage(env);
      const balance = (await getCreditAccount(env, 'user-1'))?.balance;
      expect(balance).toBe(status === 'reserved' ? 900 : 1000);
    } finally {
      sqlite.close();
    }
  });
});
