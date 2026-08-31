import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retains expired budget windows until their reservations can be removed', async () => {
    const { reserveAIDailyBudget, settleAIDailyBudget, cleanupAIGovernance } =
      await import('../../lib/aiBudget.js');
    const { env, sqlite, addUsage } = createFixture();
    try {
      for (const id of ['old', 'active', 'recent']) {
        addUsage(id);
        await reserveAIDailyBudget(env, id, 10, 1000);
      }
      await settleAIDailyBudget(env, 'old', 5);
      await settleAIDailyBudget(env, 'recent', 5);
      const now = Date.now();
      sqlite
        .prepare('UPDATE ai_budget_reservations SET expires_at = ? WHERE usage_event_id != ?')
        .run(now - 8 * 86_400_000, 'recent');
      sqlite
        .prepare(`INSERT INTO ai_governance_counters
          (scope, subject, window_id, value, expires_at) VALUES (?, ?, ?, ?, ?)`)
        .run('rate:explain', 'user-1', 'w', 1, now - 1);
      sqlite.prepare('UPDATE ai_daily_budget_counters SET expires_at = ?').run(now - 1);
      sqlite
        .prepare(
          'INSERT INTO request_rate_limits (scope,subject,window_id,value,expires_at) VALUES (?,?,?,?,?)',
        )
        .run('auth', 'ip', 'w', 1, now - 1);
      await cleanupAIGovernance(env, now);
      expect(
        sqlite
          .prepare('SELECT usage_event_id FROM ai_budget_reservations ORDER BY usage_event_id')
          .all(),
      ).toEqual([{ usage_event_id: 'active' }, { usage_event_id: 'recent' }]);
      expect(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_governance_counters').get()?.n).toBe(0);
      expect(sqlite.prepare('SELECT COUNT(*) AS n FROM request_rate_limits').get()?.n).toBe(0);
      expect(sqlite.prepare('SELECT value FROM ai_daily_budget_counters').get()?.value).toBe(20);

      expect(await settleAIDailyBudget(env, 'active', 2)).toBe(12);
      await cleanupAIGovernance(env, now + 9 * 86_400_000);
      expect(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_budget_reservations').get()?.n).toBe(0);
      expect(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_daily_budget_counters').get()?.n).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it('replaces admission estimates with actual usage', async () => {
    const { reserveAIDailyBudget, settleAIDailyBudget } = await import('../../lib/aiBudget.js');
    const { env, sqlite, addUsage } = createFixture();
    addUsage('usage-1');
    addUsage('usage-2');

    expect(await reserveAIDailyBudget(env, 'usage-1', 70, 100)).toBe(70);
    expect(await reserveAIDailyBudget(env, 'usage-2', 40, 100)).toBeNull();
    expect(await settleAIDailyBudget(env, 'usage-1', 20)).toBe(20);
    expect(await reserveAIDailyBudget(env, 'usage-2', 70, 100)).toBe(90);

    const counter = sqlite.prepare('SELECT value FROM ai_daily_budget_counters').get() as {
      value: number;
    };
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

  it.each([1.4, -1, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid actual token facts %s',
    async (actualTokens) => {
      const { reserveAIDailyBudget, settleAIDailyBudget } = await import('../../lib/aiBudget.js');
      const { env, sqlite, addUsage } = createFixture();
      try {
        addUsage('usage-1');
        await reserveAIDailyBudget(env, 'usage-1', 10, 100);
        await expect(settleAIDailyBudget(env, 'usage-1', actualTokens)).rejects.toThrow(
          'INVALID_BUDGET_TOKEN_AMOUNT',
        );
        expect(
          sqlite
            .prepare('SELECT actual_tokens FROM ai_budget_reservations WHERE usage_event_id = ?')
            .get('usage-1'),
        ).toEqual({ actual_tokens: null });
      } finally {
        sqlite.close();
      }
    },
  );

  it('rejects a budget counter overflow atomically', async () => {
    const { reserveAIDailyBudget, settleAIDailyBudget } = await import('../../lib/aiBudget.js');
    const { env, sqlite, addUsage } = createFixture();
    try {
      addUsage('usage-1');
      await reserveAIDailyBudget(env, 'usage-1', 1, Number.MAX_SAFE_INTEGER);
      sqlite.prepare('UPDATE ai_daily_budget_counters SET value = ?').run(Number.MAX_SAFE_INTEGER);
      await expect(settleAIDailyBudget(env, 'usage-1', 2)).rejects.toThrow(
        'BUDGET_COUNTER_OVERFLOW',
      );
      expect(
        sqlite
          .prepare('SELECT actual_tokens FROM ai_budget_reservations WHERE usage_event_id = ?')
          .get('usage-1'),
      ).toEqual({ actual_tokens: null });
    } finally {
      sqlite.close();
    }
  });

  it('releases abandoned reservations after usage reaches a terminal status', async () => {
    const { reconcileTerminalAIBudgets, reserveAIDailyBudget } =
      await import('../../lib/aiBudget.js');
    const { env, sqlite, addUsage } = createFixture();
    addUsage('usage-1');

    await reserveAIDailyBudget(env, 'usage-1', 80, 100);
    sqlite.prepare("UPDATE usage_events SET status = 'failed' WHERE id = ?").run('usage-1');

    expect(await reconcileTerminalAIBudgets(env)).toBe(1);
    const counter = sqlite.prepare('SELECT value FROM ai_daily_budget_counters').get() as {
      value: number;
    };
    expect(counter.value).toBe(0);
  });

  it('keeps daily capacity isolated when a previous-day request arrives late', async () => {
    const { reserveAIDailyBudget, settleAIDailyBudget, reconcileTerminalAIBudgets } =
      await import('../../lib/aiBudget.js');
    const { env, sqlite, addUsage } = createFixture();
    try {
      vi.useFakeTimers();
      vi.setSystemTime('2026-08-31T23:59:59.990Z');
      for (const id of ['old-late', 'new-first', 'new-second', 'old-extra']) addUsage(id);

      let releaseOld = () => {};
      const waitForOld = new Promise<void>((resolve) => {
        releaseOld = resolve;
      });
      const prepare = env.USER_DB.prepare.bind(env.USER_DB);
      const delayedEnv = {
        ...env,
        USER_DB: {
          prepare(sql: string) {
            const statement = prepare(sql);
            return {
              bind(...bindings: unknown[]) {
                const bound = statement.bind(...bindings);
                return new Proxy(bound, {
                  get(target, key) {
                    if (
                      key === 'run' &&
                      sql.includes('INSERT INTO ai_budget_reservations') &&
                      bindings[0] === 'old-late'
                    ) {
                      return async () => {
                        await waitForOld;
                        return target.run();
                      };
                    }
                    const value = Reflect.get(target, key);
                    return typeof value === 'function' ? value.bind(target) : value;
                  },
                });
              },
            };
          },
        } as D1Database,
      };

      const oldPending = reserveAIDailyBudget(delayedEnv, 'old-late', 80, 100);
      vi.setSystemTime('2026-09-01T00:00:00.010Z');
      expect(await reserveAIDailyBudget(env, 'new-first', 80, 100)).toBe(80);
      releaseOld();
      expect(await oldPending).toBe(80);
      expect(await reserveAIDailyBudget(env, 'new-second', 80, 100)).toBeNull();

      expect(await settleAIDailyBudget(env, 'old-late', 30)).toBe(30);
      expect(await reserveAIDailyBudget(env, 'new-second', 30, 100)).toBeNull();

      vi.setSystemTime('2026-08-31T23:59:59.990Z');
      expect(await reserveAIDailyBudget(env, 'old-extra', 50, 100)).toBe(80);
      vi.setSystemTime('2026-09-01T00:00:00.010Z');
      sqlite.prepare("UPDATE usage_events SET status = 'failed' WHERE id = ?").run('old-extra');
      expect(await reconcileTerminalAIBudgets(env)).toBe(1);
      expect(await reserveAIDailyBudget(env, 'new-second', 30, 100)).toBeNull();
      expect(
        sqlite
          .prepare('SELECT window_id, value FROM ai_daily_budget_counters ORDER BY window_id')
          .all(),
      ).toEqual([
        { window_id: '20260831', value: 30 },
        { window_id: '20260901', value: 80 },
      ]);
    } finally {
      sqlite.close();
    }
  });
});
