import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';
import { createCreditFixture } from '../helpers/creditFixture.js';
import { reclaimStaleAIUsage } from '../../lib/aiUsage.js';
const createEnv = (db: unknown): ApiEnv['Bindings'] =>
  ({ USER_DB: db as D1Database }) as ApiEnv['Bindings'];
describe('reclaimStaleAIUsage with SQLite timestamps', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('../../lib/credits.js');
  });

  it.each(['2026-08-27T12:15:00.000Z', '2026-08-28T00:01:00.000Z'])(
    'only refunds expired reservations and preserves normal settlement at %s',
    async (timestamp) => {
      const { reserveAIUsage, reclaimStaleAIUsage, completeAIUsage, recordAIUsageAttempt } =
        await import('../../lib/aiUsage.js');
      const { applyCreditMutation, getCreditAccount } = await import('../../lib/credits.js');
      const { database, sqlite } = createSqliteD1Database({ includeMeta: true });
      const env = createEnv(database);
      const now = Date.parse(timestamp);
      const ttlMs = 15 * 60 * 1000;

      try {
        sqlite
          .prepare(
            'INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run('user-1', 'User', 'user@example.com', 1, 1);
        await applyCreditMutation(env, {
          userId: 'user-1',
          kind: 'grant',
          source: 'signup_bonus',
          amount: 1000,
          idempotencyKey: 'signup',
        });
        const reserve = async (requestId: string, ageMs: number) => {
          const reservation = await reserveAIUsage(env, {
            userId: 'user-1',
            routeKey: 'review',
            requestId,
            estimatedTokens: 100,
          });
          sqlite
            .prepare('UPDATE usage_events SET created_at = ? WHERE id = ?')
            .run(now - ageMs, reservation.usageEventId);
          return reservation;
        };
        const fresh = await reserve('fresh', 60_000);
        const boundary = await reserve('boundary', ttlMs);
        await reserve('stale', ttlMs + 1000);

        expect(await reclaimStaleAIUsage(env, { now, ttlMs })).toEqual({
          scanned: 1,
          reclaimed: 1,
          failures: [],
        });
        expect((await getCreditAccount(env, 'user-1'))?.balance).toBe(800);

        await recordAIUsageAttempt(env, fresh);
        await recordAIUsageAttempt(env, boundary);
        await completeAIUsage(env, fresh, {
          observedTotalTokens: 60,
          chargedTokens: 60,
          providerBudgetTokens: 60,
          usageEstimated: false,
        });
        await completeAIUsage(env, boundary, {
          observedTotalTokens: 60,
          chargedTokens: 60,
          providerBudgetTokens: 60,
          usageEstimated: false,
        });

        expect((await getCreditAccount(env, 'user-1'))?.balance).toBe(880);
        expect(
          sqlite.prepare('SELECT request_id, status FROM usage_events ORDER BY request_id').all(),
        ).toEqual([
          { request_id: 'boundary', status: 'succeeded' },
          { request_id: 'fresh', status: 'succeeded' },
          { request_id: 'stale', status: 'failed' },
        ]);
      } finally {
        sqlite.close();
      }
    },
  );
});

describe('legacy usage recovery', () => {
  it.each([
    ['pending', null, 1000, 'failed'],
    ['reserved', null, 900, 'failed'],
    ['reclaiming', 0, 1000, 'failed'],
    ['reclaiming', 100, 900, 'failed'],
    ['settling_succeeded', 60, 940, 'succeeded'],
    ['settling_failed', 60, 940, 'failed'],
    ['settling_failed', null, 1000, 'failed'],
  ] as const)('recovers %s with usage %s', async (status, actual, expected, terminal) => {
    const f = await createCreditFixture();
    try {
      await f.reserve();
      f.sqlite
        .prepare(`UPDATE usage_events SET
          status = ?, actual_total_tokens = ?, charged_tokens = NULL,
          attempt_count = NULL, usage_is_estimated = NULL, created_at = 1`)
        .run(status, actual);
      expect(await reclaimStaleAIUsage(f.env)).toEqual({
        scanned: 1,
        reclaimed: 1,
        failures: [],
      });
      expect(await reclaimStaleAIUsage(f.env)).toEqual({
        scanned: 0,
        reclaimed: 0,
        failures: [],
      });
      expect(await f.balance()).toBe(expected);
      expect(f.sqlite.prepare('SELECT status FROM usage_events').get()?.status).toBe(terminal);
    } finally {
      f.sqlite.close();
    }
  });
  it('does not refund an old pending event with no consume entry', async () => {
    const f = await createCreditFixture();
    try {
      f.sqlite.exec(
        "INSERT INTO usage_events (id,user_id,route_key,request_id,estimated_tokens,status,created_at) VALUES ('legacy','user-1','explain','r',100,'pending',1)",
      );
      await reclaimStaleAIUsage(f.env);
      expect(await f.balance()).toBe(1000);
    } finally {
      f.sqlite.close();
    }
  });

  it('defers failed settlements so later recoverable rows are not starved', async () => {
    const f = await createCreditFixture();
    try {
      f.sqlite.exec('BEGIN');
      for (let index = 0; index < 200; index += 1) {
        const suffix = String(index).padStart(3, '0');
        const userId = `debt-user-${suffix}`;
        const usageId = `debt-usage-${suffix}`;
        f.sqlite
          .prepare(
            'INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, 1, 1)',
          )
          .run(userId, userId, `${userId}@example.com`);
        f.sqlite
          .prepare('INSERT INTO credit_accounts (user_id, balance, version) VALUES (?, 1, 0)')
          .run(userId);
        f.sqlite
          .prepare(`INSERT INTO usage_events (
            id, user_id, route_key, request_id, estimated_tokens, actual_total_tokens,
            charged_tokens, attempt_count, usage_is_estimated, status, created_at
          ) VALUES (?, ?, 'explain', ?, 1, 2, 2, 1, 0, 'settling_succeeded', 1)`)
          .run(usageId, userId, `request-${usageId}`);
        f.sqlite
          .prepare(`INSERT INTO credit_ledger (
            id, user_id, kind, source, amount, balance_after, idempotency_key,
            related_usage_id, created_at
          ) VALUES (?, ?, 'consume', 'ai_explain', 1, 0, ?, ?, 1)`)
          .run(`reserve-${usageId}`, userId, `${usageId}:reserve`, usageId);
      }
      f.sqlite.exec(`INSERT INTO usage_events (
        id, user_id, route_key, request_id, estimated_tokens, charged_tokens,
        attempt_count, usage_is_estimated, status, created_at
      ) VALUES ('recoverable', 'user-1', 'explain', 'recoverable-request', 1, 0, 0, 0, 'pending', 1)`);
      f.sqlite.exec('COMMIT');

      const first = await reclaimStaleAIUsage(f.env, { now: 1_000, ttlMs: 0 });
      expect(first).toMatchObject({ scanned: 200, reclaimed: 0 });
      expect(first.failures).toHaveLength(200);

      expect(await reclaimStaleAIUsage(f.env, { now: 1_001, ttlMs: 0 })).toEqual({
        scanned: 1,
        reclaimed: 1,
        failures: [],
      });
      expect(
        f.sqlite.prepare("SELECT status FROM usage_events WHERE id = 'recoverable'").get(),
      ).toEqual({ status: 'failed' });
    } finally {
      f.sqlite.close();
    }
  });

  it('prioritizes a due retry over newly prepared settlements', async () => {
    const f = await createCreditFixture();
    try {
      const due = await f.reserve();
      const fresh = await f.reserve();
      f.sqlite
        .prepare(`UPDATE usage_events SET
          status = 'settling_failed', charged_tokens = 0, provider_budget_tokens = 0,
          attempt_count = 0, usage_is_estimated = 0, created_at = 1, recovery_after = 100
          WHERE id = ?`)
        .run(due.usageEventId);
      f.sqlite
        .prepare(`UPDATE usage_events SET
          status = 'settling_failed', charged_tokens = 0, provider_budget_tokens = 0,
          attempt_count = 0, usage_is_estimated = 0, created_at = 999, recovery_after = NULL
          WHERE id = ?`)
        .run(fresh.usageEventId);

      expect(await reclaimStaleAIUsage(f.env, { now: 1_000, ttlMs: 0, limit: 1 })).toEqual({
        scanned: 1,
        reclaimed: 1,
        failures: [],
      });
      expect(
        f.sqlite.prepare('SELECT status FROM usage_events WHERE id = ?').get(due.usageEventId),
      ).toEqual({ status: 'failed' });
      expect(
        f.sqlite.prepare('SELECT status FROM usage_events WHERE id = ?').get(fresh.usageEventId),
      ).toEqual({ status: 'settling_failed' });
    } finally {
      f.sqlite.close();
    }
  });
});
