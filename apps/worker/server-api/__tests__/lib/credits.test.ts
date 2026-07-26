import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  RATE_LIMIT_KV: {} as KVNamespace,
  USER_DB: {} as D1Database,
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  SIGNUP_BONUS_CREDITS: '100000',
  ...overrides,
});

const createMockDb = () => {
  const mockPrepare = vi.fn();
  const mockBind = vi.fn();
  const mockFirst = vi.fn();
  const mockAll = vi.fn();
  const mockRun = vi.fn();

  mockPrepare.mockReturnValue({ bind: mockBind });
  mockBind.mockReturnValue({ first: mockFirst, all: mockAll, run: mockRun });

  return {
    prepare: mockPrepare,
    bind: mockBind,
    first: mockFirst,
    all: mockAll,
    run: mockRun,
  };
};

describe('credits', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('ensureCreditAccount', () => {
    it('inserts or ignores a credit account for the user', async () => {
      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { ensureCreditAccount } = await import('../../lib/credits.js');
      await ensureCreditAccount(createEnv({ USER_DB: db as unknown as D1Database }), 'user-1');

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO credit_accounts'),
      );
      expect(db.bind).toHaveBeenCalledWith('user-1');
      expect(db.run).toHaveBeenCalled();
    });
  });

  describe('getCreditAccount', () => {
    it('returns null when no account exists', async () => {
      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 0 } });
      db.first.mockResolvedValue(null);

      const { getCreditAccount } = await import('../../lib/credits.js');
      const result = await getCreditAccount(
        createEnv({ USER_DB: db as unknown as D1Database }),
        'user-1',
      );

      expect(result).toBeNull();
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE'));
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
    });

    it('returns account row when account exists', async () => {
      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 0 } });
      db.first.mockResolvedValue({
        userId: 'user-1',
        balance: 500,
        version: 2,
        updatedAt: '2026-04-11T00:00:00Z',
      });

      const { getCreditAccount } = await import('../../lib/credits.js');
      const result = await getCreditAccount(
        createEnv({ USER_DB: db as unknown as D1Database }),
        'user-1',
      );

      expect(result).toEqual({
        userId: 'user-1',
        balance: 500,
        version: 2,
        updatedAt: '2026-04-11T00:00:00Z',
      });
    });
  });

  describe('listCreditLedger', () => {
    it('returns empty array when no entries exist', async () => {
      const db = createMockDb();
      db.all.mockResolvedValue({ results: [] });

      const { listCreditLedger } = await import('../../lib/credits.js');
      const result = await listCreditLedger(
        createEnv({ USER_DB: db as unknown as D1Database }),
        'user-1',
        { limit: 10, offset: 0 },
      );

      expect(result).toEqual([]);
      expect(db.bind).toHaveBeenCalledWith('user-1', 10, 0);
    });

    it('returns mapped ledger rows', async () => {
      const db = createMockDb();
      db.all.mockResolvedValue({
        results: [
          {
            id: 'ledger-1',
            userId: 'user-1',
            kind: 'grant',
            source: 'signup_bonus',
            amount: 100000,
            balanceAfter: 100000,
            idempotencyKey: 'signup:user-1',
            relatedUsageId: null,
            metadataJson: null,
            createdAt: '2026-04-11T00:00:00Z',
          },
        ],
      });

      const { listCreditLedger } = await import('../../lib/credits.js');
      const result = await listCreditLedger(
        createEnv({ USER_DB: db as unknown as D1Database }),
        'user-1',
        { limit: 5, offset: 20 },
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'ledger-1',
        kind: 'grant',
        source: 'signup_bonus',
        amount: 100000,
        balanceAfter: 100000,
      });
      expect(db.bind).toHaveBeenCalledWith('user-1', 5, 20);
    });

    it('binds date filters when listing ledger rows', async () => {
      const db = createMockDb();
      db.all.mockResolvedValue({ results: [] });

      const { listCreditLedger } = await import('../../lib/credits.js');
      await listCreditLedger(createEnv({ USER_DB: db as unknown as D1Database }), 'user-1', {
        limit: 5,
        offset: 10,
        startDate: '2026-04-01 00:00:00',
        endDate: '2026-04-30 00:00:00',
      });

      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('created_at >= ?'));
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('created_at < ?'));
      expect(db.bind).toHaveBeenCalledWith(
        'user-1',
        '2026-04-01 00:00:00',
        '2026-04-30 00:00:00',
        5,
        10,
      );
    });

    it('counts ledger rows with matching filters', async () => {
      const db = createMockDb();
      db.first.mockResolvedValue({ total: 12 });

      const { countCreditLedger } = await import('../../lib/credits.js');
      const result = await countCreditLedger(
        createEnv({ USER_DB: db as unknown as D1Database }),
        'user-1',
        {
          startDate: '2026-04-01 00:00:00',
          endDate: '2026-04-30 00:00:00',
        },
      );

      expect(result).toBe(12);
      expect(db.bind).toHaveBeenCalledWith('user-1', '2026-04-01 00:00:00', '2026-04-30 00:00:00');
    });
  });

  describe('applyCreditMutation', () => {
    const createMutationInput = (overrides = {}) => ({
      userId: 'user-1',
      kind: 'consume' as const,
      source: 'ai_generate' as const,
      amount: 10,
      idempotencyKey: 'test-key',
      ...overrides,
    });

    it('throws INVALID_CREDIT_AMOUNT for non-positive amount', async () => {
      const db = createMockDb();
      const { applyCreditMutation } = await import('../../lib/credits.js');

      await expect(
        applyCreditMutation(createEnv({ USER_DB: db as unknown as D1Database }), {
          ...createMutationInput(),
          amount: 0,
        }),
      ).rejects.toThrow('INVALID_CREDIT_AMOUNT');

      await expect(
        applyCreditMutation(createEnv({ USER_DB: db as unknown as D1Database }), {
          ...createMutationInput(),
          amount: -5,
        }),
      ).rejects.toThrow('INVALID_CREDIT_AMOUNT');
    });

    it('throws INVALID_CREDIT_AMOUNT for non-finite amount', async () => {
      const db = createMockDb();
      const { applyCreditMutation } = await import('../../lib/credits.js');

      await expect(
        applyCreditMutation(createEnv({ USER_DB: db as unknown as D1Database }), {
          ...createMutationInput(),
          amount: Infinity,
        }),
      ).rejects.toThrow('INVALID_CREDIT_AMOUNT');

      await expect(
        applyCreditMutation(createEnv({ USER_DB: db as unknown as D1Database }), {
          ...createMutationInput(),
          amount: NaN,
        }),
      ).rejects.toThrow('INVALID_CREDIT_AMOUNT');
    });

    it('returns existing ledger row when idempotency key matches', async () => {
      const db = createMockDb();
      const existingRow = {
        id: 'existing-ledger',
        userId: 'user-1',
        kind: 'consume',
        source: 'ai_generate',
        amount: 10,
        balanceAfter: 990,
        idempotencyKey: 'test-key',
        relatedUsageId: null,
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      };
      db.first.mockResolvedValue(existingRow);

      const { applyCreditMutation } = await import('../../lib/credits.js');
      const result = await applyCreditMutation(
        createEnv({ USER_DB: db as unknown as D1Database }),
        createMutationInput(),
      );

      expect(result.id).toBe('existing-ledger');
      expect(result.idempotencyKey).toBe('test-key');
      expect(db.run).not.toHaveBeenCalled();
    });

    it('processes a normal consume mutation', async () => {
      const db = createMockDb();
      // First call: readExistingLedger returns null
      // Second call: getCreditAccount ensureCreditAccount run
      // Third call: getCreditAccount select
      // Fourth call: insert ledger
      // Fifth call: readExistingLedger returns created row
      db.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-1',
          balance: 100,
          version: 1,
          updatedAt: '2026-04-11T00:00:00Z',
        })
        .mockResolvedValueOnce({
          id: 'consume:test-key',
          userId: 'user-1',
          kind: 'consume',
          source: 'ai_generate',
          amount: 10,
          balanceAfter: 90,
          idempotencyKey: 'test-key',
          relatedUsageId: null,
          metadataJson: null,
          createdAt: '2026-04-11T00:00:00Z',
        });
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { applyCreditMutation } = await import('../../lib/credits.js');
      const result = await applyCreditMutation(
        createEnv({ USER_DB: db as unknown as D1Database }),
        createMutationInput(),
      );

      expect(result.kind).toBe('consume');
      expect(result.balanceAfter).toBe(90);
      expect(result.amount).toBe(10);
    });

    it('processes a normal grant/refund mutation', async () => {
      const db = createMockDb();
      db.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-1',
          balance: 100,
          version: 1,
          updatedAt: '2026-04-11T00:00:00Z',
        })
        .mockResolvedValueOnce({
          id: 'refund:test-key',
          userId: 'user-1',
          kind: 'refund',
          source: 'manual_adjustment',
          amount: 50,
          balanceAfter: 150,
          idempotencyKey: 'test-key',
          relatedUsageId: null,
          metadataJson: null,
          createdAt: '2026-04-11T00:00:00Z',
        });
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { applyCreditMutation } = await import('../../lib/credits.js');
      const result = await applyCreditMutation(
        createEnv({ USER_DB: db as unknown as D1Database }),
        createMutationInput({ kind: 'refund', amount: 50, source: 'manual_adjustment' }),
      );

      expect(result.kind).toBe('refund');
      expect(result.balanceAfter).toBe(150);
    });

    it('throws CREDIT_EXHAUSTED when balance is insufficient', async () => {
      const db = createMockDb();
      db.first.mockResolvedValueOnce(null).mockResolvedValueOnce({
        userId: 'user-1',
        balance: 5,
        version: 1,
        updatedAt: '2026-04-11T00:00:00Z',
      });
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { applyCreditMutation } = await import('../../lib/credits.js');
      await expect(
        applyCreditMutation(
          createEnv({ USER_DB: db as unknown as D1Database }),
          createMutationInput({ amount: 10 }),
        ),
      ).rejects.toThrow('CREDIT_EXHAUSTED');
    });

    it('retries when the ledger trigger reports a balance conflict', async () => {
      const db = createMockDb();
      db.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-1',
          balance: 100,
          version: 1,
          updatedAt: '2026-04-11T00:00:00Z',
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-1',
          balance: 100,
          version: 2,
          updatedAt: '2026-04-11T00:00:01Z',
        })
        .mockResolvedValueOnce({
          id: 'consume:test-key',
          userId: 'user-1',
          kind: 'consume',
          source: 'ai_generate',
          amount: 10,
          balanceAfter: 90,
          idempotencyKey: 'test-key',
          relatedUsageId: null,
          metadataJson: null,
          createdAt: '2026-04-11T00:00:00Z',
        });
      db.run
        .mockResolvedValueOnce({ success: true, meta: { changes: 1 } })
        .mockResolvedValueOnce({ success: true, meta: { changes: 1 } })
        .mockRejectedValueOnce(new Error('CREDIT_CONFLICT'))
        .mockResolvedValueOnce({ success: true, meta: { changes: 1 } })
        .mockResolvedValueOnce({ success: true, meta: { changes: 1 } });

      const { applyCreditMutation } = await import('../../lib/credits.js');
      const result = await applyCreditMutation(
        createEnv({ USER_DB: db as unknown as D1Database }),
        createMutationInput(),
      );

      expect(result.balanceAfter).toBe(90);
    });

    it('returns an equivalent ledger written by a concurrent request', async () => {
      const db = createMockDb();
      const existingRow = {
        id: 'consume:test-key',
        userId: 'user-1',
        kind: 'consume',
        source: 'ai_generate',
        amount: 10,
        balanceAfter: 90,
        idempotencyKey: 'test-key',
        relatedUsageId: null,
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      };
      db.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-1',
          balance: 100,
          version: 1,
          updatedAt: '2026-04-11T00:00:00Z',
        })
        .mockResolvedValueOnce(existingRow);
      db.run
        .mockResolvedValueOnce({ success: true, meta: { changes: 1 } })
        .mockResolvedValueOnce({ success: true, meta: { changes: 1 } })
        .mockRejectedValueOnce(new Error('UNIQUE constraint failed'));

      const { applyCreditMutation } = await import('../../lib/credits.js');
      const result = await applyCreditMutation(
        createEnv({ USER_DB: db as unknown as D1Database }),
        createMutationInput(),
      );

      expect(result.idempotencyKey).toBe('test-key');
      expect(result.balanceAfter).toBe(90);
    });

    it('throws CREDIT_CONFLICT after max retries', async () => {
      const db = createMockDb();
      db.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-1',
          balance: 100,
          version: 1,
          updatedAt: '2026-04-11T00:00:00Z',
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-1',
          balance: 100,
          version: 1,
          updatedAt: '2026-04-11T00:00:00Z',
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-1',
          balance: 100,
          version: 1,
          updatedAt: '2026-04-11T00:00:00Z',
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      db.run
        .mockResolvedValueOnce({ success: true, meta: { changes: 1 } })
        .mockResolvedValueOnce({ success: true, meta: { changes: 1 } })
        .mockRejectedValueOnce(new Error('CREDIT_CONFLICT'))
        .mockResolvedValueOnce({ success: true, meta: { changes: 1 } })
        .mockRejectedValueOnce(new Error('CREDIT_CONFLICT'))
        .mockResolvedValueOnce({ success: true, meta: { changes: 1 } })
        .mockRejectedValueOnce(new Error('CREDIT_CONFLICT'));

      const { applyCreditMutation } = await import('../../lib/credits.js');
      await expect(
        applyCreditMutation(
          createEnv({ USER_DB: db as unknown as D1Database }),
          createMutationInput(),
        ),
      ).rejects.toThrow('CREDIT_CONFLICT');
    });

    it('throws CREDIT_ACCOUNT_MISSING when account cannot be found', async () => {
      const db = createMockDb();
      // first #1: readExistingLedger - null
      // first #2: getCreditAccount returns null (no row after insert)
      db.first.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { applyCreditMutation } = await import('../../lib/credits.js');
      await expect(
        applyCreditMutation(
          createEnv({ USER_DB: db as unknown as D1Database }),
          createMutationInput(),
        ),
      ).rejects.toThrow('CREDIT_ACCOUNT_MISSING');
    });

    it('throws CREDIT_LEDGER_WRITE_FAILED when created ledger cannot be read back', async () => {
      const db = createMockDb();
      db.first
        .mockResolvedValueOnce(null) // readExistingLedger - null
        .mockResolvedValueOnce({
          userId: 'user-1',
          balance: 100,
          version: 1,
          updatedAt: '2026-04-11T00:00:00Z',
        })
        .mockResolvedValueOnce(null); // read back after insert returns null
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { applyCreditMutation } = await import('../../lib/credits.js');
      await expect(
        applyCreditMutation(
          createEnv({ USER_DB: db as unknown as D1Database }),
          createMutationInput(),
        ),
      ).rejects.toThrow('CREDIT_LEDGER_WRITE_FAILED');
    });

    it('uses custom ledgerId when provided', async () => {
      const db = createMockDb();
      db.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-1',
          balance: 100,
          version: 1,
          updatedAt: '2026-04-11T00:00:00Z',
        })
        .mockResolvedValueOnce({
          id: 'custom-ledger-id',
          userId: 'user-1',
          kind: 'consume',
          source: 'ai_generate',
          amount: 10,
          balanceAfter: 90,
          idempotencyKey: 'test-key',
          relatedUsageId: null,
          metadataJson: null,
          createdAt: '2026-04-11T00:00:00Z',
        });
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { applyCreditMutation } = await import('../../lib/credits.js');
      const result = await applyCreditMutation(
        createEnv({ USER_DB: db as unknown as D1Database }),
        createMutationInput({ ledgerId: 'custom-ledger-id' }),
      );

      expect(result.id).toBe('custom-ledger-id');
      const insertCall = db.bind.mock.calls.find((call) => call[0] === 'custom-ledger-id');
      expect(insertCall).toBeDefined();
    });

    it('stores metadata_json when metadata is provided', async () => {
      const db = createMockDb();
      db.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-1',
          balance: 100,
          version: 1,
          updatedAt: '2026-04-11T00:00:00Z',
        })
        .mockResolvedValueOnce({
          id: 'consume:test-key',
          userId: 'user-1',
          kind: 'consume',
          source: 'ai_generate',
          amount: 10,
          balanceAfter: 90,
          idempotencyKey: 'test-key',
          relatedUsageId: 'usage-123',
          metadataJson: '{"routeKey":"generate-table"}',
          createdAt: '2026-04-11T00:00:00Z',
        });
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { applyCreditMutation } = await import('../../lib/credits.js');
      const result = await applyCreditMutation(
        createEnv({ USER_DB: db as unknown as D1Database }),
        createMutationInput({
          relatedUsageId: 'usage-123',
          metadata: { routeKey: 'generate-table' },
        }),
      );

      expect(result.relatedUsageId).toBe('usage-123');
      expect(result.metadataJson).toBe('{"routeKey":"generate-table"}');
    });
  });
});
