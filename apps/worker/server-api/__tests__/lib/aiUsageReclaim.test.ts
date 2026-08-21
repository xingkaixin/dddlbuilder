import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';

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
  status: 'reserved',
  ...overrides,
});

const loadReclaim = async (ledgerEntry: unknown, applyCreditMutation = vi.fn()) => {
  vi.doMock('../../lib/credits.js', () => ({
    applyCreditMutation,
    readCreditLedgerEntry: vi.fn().mockResolvedValue(ledgerEntry),
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
    expect(runs.at(-1)?.sql).toContain("SET status = 'failed'");
  });

  it('settles a pending event without refunding when no consume entry was written', async () => {
    const { db } = createDb([staleRow({ status: 'pending' })]);
    const { reclaimStaleAIUsage, applyCreditMutation } = await loadReclaim(null);

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
