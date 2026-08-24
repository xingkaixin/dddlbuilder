import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';

const createFixture = () => {
  const { database, sqlite } = createSqliteD1Database({ includeMeta: true });
  sqlite
    .prepare('INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('user-1', 'User One', 'user-1@example.com', 1, 1);

  const addUsage = (id: string) => {
    sqlite
      .prepare(
        `
          INSERT INTO usage_events (
            id,
            user_id,
            route_key,
            request_id,
            estimated_tokens,
            status
          )
          VALUES (?, 'user-1', 'explain', ?, 100, 'reserved')
        `,
      )
      .run(id, `request-${id}`);
  };

  return {
    env: { USER_DB: database } as ApiEnv['Bindings'],
    sqlite,
    addUsage,
  };
};

describe('AI daily budget lifecycle', () => {
  it('replaces admission estimates with actual usage', async () => {
    const { reserveAIDailyBudget, settleAIDailyBudget } = await import('../../lib/aiBudget.js');
    const { env, sqlite, addUsage } = createFixture();
    addUsage('usage-1');
    addUsage('usage-2');

    expect(await reserveAIDailyBudget(env, 'usage-1', 70, 100)).toBe(70);
    expect(await reserveAIDailyBudget(env, 'usage-2', 40, 100)).toBeNull();
    expect(await settleAIDailyBudget(env, 'usage-1', 20)).toBe(20);
    expect(await reserveAIDailyBudget(env, 'usage-2', 70, 100)).toBe(90);

    const counter = sqlite
      .prepare(
        "SELECT value FROM ai_governance_counters WHERE scope = 'daily-budget' AND subject = 'global'",
      )
      .get() as { value: number };
    expect(counter.value).toBe(90);
  });

  it('settles each reservation only once', async () => {
    const { reserveAIDailyBudget, settleAIDailyBudget } = await import('../../lib/aiBudget.js');
    const { env, sqlite, addUsage } = createFixture();
    addUsage('usage-1');

    await reserveAIDailyBudget(env, 'usage-1', 80, 100);
    expect(await settleAIDailyBudget(env, 'usage-1', 15)).toBe(15);
    expect(await settleAIDailyBudget(env, 'usage-1', 5)).toBeNull();

    const reservation = sqlite
      .prepare(
        'SELECT reserved_tokens AS reservedTokens, actual_tokens AS actualTokens FROM ai_budget_reservations WHERE usage_event_id = ?',
      )
      .get('usage-1') as { reservedTokens: number; actualTokens: number };
    expect(reservation).toEqual({ reservedTokens: 80, actualTokens: 15 });
  });

  it('releases abandoned reservations after usage reaches a terminal status', async () => {
    const { reconcileTerminalAIBudgets, reserveAIDailyBudget } =
      await import('../../lib/aiBudget.js');
    const { env, sqlite, addUsage } = createFixture();
    addUsage('usage-1');

    await reserveAIDailyBudget(env, 'usage-1', 80, 100);
    sqlite.prepare("UPDATE usage_events SET status = 'failed' WHERE id = ?").run('usage-1');

    expect(await reconcileTerminalAIBudgets(env)).toBe(1);
    const counter = sqlite
      .prepare(
        "SELECT value FROM ai_governance_counters WHERE scope = 'daily-budget' AND subject = 'global'",
      )
      .get() as { value: number };
    expect(counter.value).toBe(0);
  });
});
