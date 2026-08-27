import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';

const createEnv = (db: unknown): ApiEnv['Bindings'] =>
  ({ USER_DB: db as D1Database }) as ApiEnv['Bindings'];

/** 按 SQL 片段分派的 D1 桩，回收流程要跨 select/update/ledger 三类语句断言顺序。 */
const createDb = (rows: Record<string, unknown>[]) => {
  const runs: { sql: string; args: unknown[] }[] = [];
  const claimed = new Set<string>();

  const prepare = vi.fn((sql: string) => ({
    bind: (...args: unknown[]) => ({
      all: async () => ({ results: rows }),
      first: async () => null,
      run: async () => {
        runs.push({ sql, args });
        if (sql.includes("SET status = 'reclaiming'")) {
          const id = String(args[0]);
          if (claimed.has(id)) return { success: true, meta: { changes: 0 } };
          claimed.add(id);
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 1 } };
      },
    }),
  }));

  return { db: { prepare }, runs };
};

const staleRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'usage:6:user-1:7:explain:5:req-1',
  userId: 'user-1',
  routeKey: 'explain',
  requestId: 'req-1',
  estimatedTokens: 120,
  actualTotalTokens: null,
  status: 'reserved',
  errorCode: null,
  ...overrides,
});

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
            .prepare('UPDATE usage_events SET created_at = datetime(?) WHERE id = ?')
            .run(new Date(now - ageMs).toISOString(), reservation.usageEventId);
          return reservation;
        };
        const fresh = await reserve('fresh', 60_000);
        const boundary = await reserve('boundary', ttlMs);
        await reserve('stale', ttlMs + 1000);

        expect(await reclaimStaleAIUsage(env, { now, ttlMs })).toEqual({
          scanned: 1,
          reclaimed: 1,
        });
        expect((await getCreditAccount(env, 'user-1'))?.balance).toBe(800);

        await completeAIUsage(env, fresh, 60);
        await completeAIUsage(env, boundary, 60);

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

const loadReclaim = async (
  reserveLedgerEntry: unknown,
  applyCreditMutation = vi.fn(),
  settlementLedgerEntry: unknown = null,
) => {
  vi.doMock('../../lib/credits.js', () => ({
    applyCreditMutation,
    readCreditLedgerEntry: vi
      .fn()
      .mockImplementation((_env, _userId, idempotencyKey: string) =>
        idempotencyKey.endsWith(':reserve') ? reserveLedgerEntry : settlementLedgerEntry,
      ),
  }));
  const { reclaimStaleAIUsage } = await import('../../lib/aiUsage.js');
  return { reclaimStaleAIUsage, applyCreditMutation };
};

describe('reclaimStaleAIUsage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('refunds a reservation whose consume entry exists and settles it as failed', async () => {
    const { db, runs } = createDb([staleRow()]);
    const { reclaimStaleAIUsage, applyCreditMutation } = await loadReclaim({
      id: 'ledger-1',
      kind: 'consume',
    });

    const result = await reclaimStaleAIUsage(createEnv(db));

    expect(result).toEqual({ scanned: 1, reclaimed: 1 });
    expect(applyCreditMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        kind: 'refund',
        amount: 120,
        idempotencyKey: 'usage:6:user-1:7:explain:5:req-1:settlement',
      }),
    );
    // 抢占必须发生在退款之前，否则会和正常结算路径同时动同一笔额度
    expect(runs[0].sql).toContain("SET status = 'reclaiming'");
    expect(runs.at(-1)?.args).toContain('failed');
  });

  it('settles a pending event without refunding when no consume entry was written', async () => {
    const { db } = createDb([staleRow({ status: 'pending' })]);
    const { reclaimStaleAIUsage, applyCreditMutation } = await loadReclaim(null);

    const result = await reclaimStaleAIUsage(createEnv(db));

    expect(result).toEqual({ scanned: 1, reclaimed: 1 });
    expect(applyCreditMutation).not.toHaveBeenCalled();
  });

  it('resumes an interrupted successful settlement from stored actual tokens', async () => {
    const { db, runs } = createDb([
      staleRow({ status: 'settling_succeeded', actualTotalTokens: 70 }),
    ]);
    const { reclaimStaleAIUsage, applyCreditMutation } = await loadReclaim(null);

    const result = await reclaimStaleAIUsage(createEnv(db));

    expect(result).toEqual({ scanned: 1, reclaimed: 1 });
    expect(applyCreditMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'refund', amount: 50 }),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].args).toContain('succeeded');
  });

  it('resumes an interrupted failed settlement without changing its outcome', async () => {
    const { db, runs } = createDb([
      staleRow({ status: 'settling_failed', errorCode: 'OPENAI_ERROR' }),
    ]);
    const { reclaimStaleAIUsage, applyCreditMutation } = await loadReclaim(null);

    const result = await reclaimStaleAIUsage(createEnv(db));

    expect(result).toEqual({ scanned: 1, reclaimed: 1 });
    expect(applyCreditMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'refund', amount: 120 }),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].args).toContain('failed');
    expect(runs[0].args).toContain('OPENAI_ERROR');
  });

  it('does not write a second settlement when a reclaiming row already has one', async () => {
    const { db } = createDb([staleRow({ status: 'reclaiming' })]);
    const { reclaimStaleAIUsage, applyCreditMutation } = await loadReclaim(
      { id: 'reserve-ledger' },
      vi.fn(),
      { id: 'settlement-ledger' },
    );

    const result = await reclaimStaleAIUsage(createEnv(db));

    expect(result).toEqual({ scanned: 1, reclaimed: 1 });
    expect(applyCreditMutation).not.toHaveBeenCalled();
  });

  it('skips a row whose status was claimed by someone else', async () => {
    const row = staleRow();
    const { db } = createDb([row, row]);
    const { reclaimStaleAIUsage, applyCreditMutation } = await loadReclaim({ id: 'ledger-1' });

    const result = await reclaimStaleAIUsage(createEnv(db));

    expect(result).toEqual({ scanned: 2, reclaimed: 1 });
    expect(applyCreditMutation).toHaveBeenCalledTimes(1);
  });

  it('keeps going when one row throws', async () => {
    const { db } = createDb([staleRow(), staleRow({ id: 'usage-2', requestId: 'req-2' })]);
    const applyCreditMutation = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ id: 'ledger-2' });
    const { reclaimStaleAIUsage } = await loadReclaim({ id: 'ledger-1' }, applyCreditMutation);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await reclaimStaleAIUsage(createEnv(db));

    expect(result).toEqual({ scanned: 2, reclaimed: 1 });
  });

  it('ignores rows carrying an unknown route key', async () => {
    const { db } = createDb([staleRow({ routeKey: 'retired-route' })]);
    const { reclaimStaleAIUsage, applyCreditMutation } = await loadReclaim({ id: 'ledger-1' });

    const result = await reclaimStaleAIUsage(createEnv(db));

    expect(result).toEqual({ scanned: 1, reclaimed: 0 });
    expect(applyCreditMutation).not.toHaveBeenCalled();
  });

  it('scans reclaiming rows so a half-finished pass is retried', async () => {
    const { db } = createDb([]);
    const { reclaimStaleAIUsage } = await loadReclaim(null);

    await reclaimStaleAIUsage(createEnv(db), { ttlMs: 1000, now: 10_000, limit: 5 });

    const select = db.prepare.mock.calls.find(([sql]) => String(sql).includes('SELECT'));
    expect(String(select?.[0])).toContain('status IN (?, ?, ?, ?, ?)');
  });
});
