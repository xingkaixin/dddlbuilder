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
      const { reserveAIUsage, reclaimStaleAIUsage, completeAIUsage } =
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
        });
        expect((await getCreditAccount(env, 'user-1'))?.balance).toBe(700);

        await completeAIUsage(env, fresh, 60);
        await completeAIUsage(env, boundary, 60);

        expect((await getCreditAccount(env, 'user-1'))?.balance).toBe(780);
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
        .prepare('UPDATE usage_events SET status = ?, actual_total_tokens = ?, created_at = 1')
        .run(status, actual);
      expect(await reclaimStaleAIUsage(f.env)).toEqual({ scanned: 1, reclaimed: 1 });
      expect(await reclaimStaleAIUsage(f.env)).toEqual({ scanned: 0, reclaimed: 0 });
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
});
