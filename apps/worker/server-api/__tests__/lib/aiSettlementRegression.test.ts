import { describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import {
  failAIUsage,
  reclaimStaleAIUsage,
  recordAIUsageAttempt,
  reserveAIUsage,
} from '../../lib/aiUsage.js';
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
  it('rolls back usage and ledger together when reservation is rejected', async () => {
    const { env, sqlite } = await fixture();
    try {
      const before = sqlite.prepare('SELECT COUNT(*) AS count FROM usage_events').get()?.count;
      const prepare = vi.spyOn(env.USER_DB, 'prepare');
      await expect(
        reserveAIUsage(env, {
          userId: 'user-1',
          routeKey: 'explain',
          requestId: 'too-large',
          estimatedTokens: 2000,
        }),
      ).rejects.toThrow('CREDIT_EXHAUSTED');
      const after = sqlite.prepare('SELECT COUNT(*) AS count FROM usage_events').get()?.count;
      expect(after).toBe(before);
      expect(prepare.mock.calls).toHaveLength(2);
    } finally {
      sqlite.close();
    }
  });

  it('charges measured usage even when local response processing fails', async () => {
    const { env, sqlite, reservation } = await fixture();
    try {
      await reserveAIDailyBudget(env, reservation.usageEventId, 100, 1000);
      await recordAIUsageAttempt(env, reservation);
      await failAIUsage(env, reservation, 'UPSTREAM_OPENAI_ERROR', {
        observedTotalTokens: 60,
        chargedTokens: 60,
        providerBudgetTokens: 60,
        usageEstimated: false,
      });
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
      if (status === 'reserved') await recordAIUsageAttempt(env, reservation);
      await reclaimStaleAIUsage(env);
      const balance = (await getCreditAccount(env, 'user-1'))?.balance;
      expect(balance).toBe(status === 'reserved' ? 900 : 1000);
    } finally {
      sqlite.close();
    }
  });
});
