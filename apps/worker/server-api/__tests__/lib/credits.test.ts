import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  // SAFETY: credits tests never call the KV binding.
  SHARE_KV: {} as KVNamespace,
  // SAFETY: the default database is replaced with the focused D1 test double in each test.
  USER_DB: {} as D1Database,
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
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

type MockDb = ReturnType<typeof createMockDb>;

const asD1Database = (db: MockDb): D1Database => {
  // SAFETY: this mock implements the D1 prepare/bind/first/all/run methods exercised by credits tests.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- a partial D1 platform double cannot implement the full runtime interface.
  return db as unknown as D1Database;
};

describe('credits', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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

    type MockLedgerRow = {
      id: string;
      userId: string;
      kind: 'consume' | 'grant' | 'refund';
      source: 'ai_generate' | 'signup_bonus' | 'ai_review' | 'ai_explain' | 'manual_adjustment';
      amount: number;
      balanceAfter: number;
      idempotencyKey: string;
      relatedUsageId: string | null;
      metadataJson: string | null;
      createdAt: number;
    };

    const ledgerRow = (overrides: Partial<MockLedgerRow> = {}) => ({
      id: 'consume:test-key',
      userId: 'user-1',
      kind: 'consume',
      source: 'ai_generate',
      amount: 10,
      balanceAfter: 90,
      idempotencyKey: 'test-key',
      relatedUsageId: null,
      metadataJson: null,
      createdAt: 1775865600000,
      ...overrides,
    });

    it('throws INVALID_CREDIT_AMOUNT for non-positive amount', async () => {
      const db = createMockDb();
      const { applyCreditMutation } = await import('../../lib/credits.js');

      await expect(
        applyCreditMutation(createEnv({ USER_DB: asD1Database(db) }), {
          ...createMutationInput(),
          amount: 0,
        }),
      ).rejects.toThrow('INVALID_CREDIT_AMOUNT');

      await expect(
        applyCreditMutation(createEnv({ USER_DB: asD1Database(db) }), {
          ...createMutationInput(),
          amount: -5,
        }),
      ).rejects.toThrow('INVALID_CREDIT_AMOUNT');
    });

    it('throws INVALID_CREDIT_AMOUNT for non-finite amount', async () => {
      const db = createMockDb();
      const { applyCreditMutation } = await import('../../lib/credits.js');

      await expect(
        applyCreditMutation(createEnv({ USER_DB: asD1Database(db) }), {
          ...createMutationInput(),
          amount: Infinity,
        }),
      ).rejects.toThrow('INVALID_CREDIT_AMOUNT');

      await expect(
        applyCreditMutation(createEnv({ USER_DB: asD1Database(db) }), {
          ...createMutationInput(),
          amount: NaN,
        }),
      ).rejects.toThrow('INVALID_CREDIT_AMOUNT');
    });

    it('returns existing ledger row when idempotency key matches', async () => {
      const db = createMockDb();
      db.first.mockResolvedValue(ledgerRow());

      const { applyCreditMutation } = await import('../../lib/credits.js');

      const result = await applyCreditMutation(
        createEnv({ USER_DB: asD1Database(db) }),
        createMutationInput(),
      );

      expect(result.id).toBe('consume:test-key');
      expect(result.idempotencyKey).toBe('test-key');
      expect(db.run).not.toHaveBeenCalled();
    });

    it('detects idempotency conflicts on a replayed key with different payload', async () => {
      const db = createMockDb();
      db.first
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('UNIQUE constraint failed'))
        .mockResolvedValueOnce(ledgerRow({ kind: 'refund', amount: 50 }));

      const { applyCreditMutation } = await import('../../lib/credits.js');
      await expect(
        applyCreditMutation(createEnv({ USER_DB: asD1Database(db) }), createMutationInput()),
      ).rejects.toThrow('CREDIT_IDEMPOTENCY_CONFLICT');
    });

    it('returns an equivalent ledger written by a concurrent request', async () => {
      const db = createMockDb();
      db.first.mockResolvedValueOnce(null).mockResolvedValueOnce(ledgerRow());
      db.first
        .mockReset()
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('UNIQUE constraint failed'))
        .mockResolvedValueOnce(ledgerRow());

      const { applyCreditMutation } = await import('../../lib/credits.js');

      const result = await applyCreditMutation(
        createEnv({ USER_DB: asD1Database(db) }),
        createMutationInput(),
      );

      expect(result.idempotencyKey).toBe('test-key');
      expect(result.balanceAfter).toBe(90);
    });
  });
});
