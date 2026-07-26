import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';
import type { ApiEnv } from '../../lib/context.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
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

describe('aiUsage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('authenticateAIUser', () => {
    it('proxies authenticateRequest and returns user info', async () => {
      const mockUser = {
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      };

      vi.doMock('../../lib/auth.js', () => ({
        authenticateRequest: vi.fn().mockResolvedValue(mockUser),
      }));

      const { authenticateAIUser } = await import('../../lib/aiUsage.js');
      const mockContext = {
        env: createEnv(),
        req: { header: vi.fn() },
        get: vi.fn(),
        set: vi.fn(),
      } as unknown as Context<ApiEnv>;

      const result = await authenticateAIUser(mockContext);
      expect(result).toEqual(mockUser);
    });
  });

  describe('reserveAIUsage', () => {
    it('reserves tokens successfully for explain route', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'consume:req-1:reserve',
        userId: 'user-1',
        kind: 'consume',
        source: 'ai_explain',
        amount: 100,
        balanceAfter: 900,
        idempotencyKey: 'req-1:reserve',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { reserveAIUsage } = await import('../../lib/aiUsage.js');
      const result = await reserveAIUsage(createEnv({ USER_DB: db as unknown as D1Database }), {
        userId: 'user-1',
        routeKey: 'explain',
        requestId: 'req-1',
        estimatedTokens: 100,
      });

      expect(result.usageEventId).toBe('usage:6:user-1:7:explain:5:req-1');
      expect(result.reservedTokens).toBe(100);
      expect(result.routeKey).toBe('explain');
      expect(mockApplyCreditMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: 'user-1',
          kind: 'consume',
          source: 'ai_explain',
          amount: 100,
          idempotencyKey: 'usage:6:user-1:7:explain:5:req-1:reserve',
          ledgerId: 'consume:usage:6:user-1:7:explain:5:req-1:reserve',
        }),
      );
    });

    it('reserves tokens successfully for review route', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'consume:req-1:reserve',
        userId: 'user-1',
        kind: 'consume',
        source: 'ai_review',
        amount: 50,
        balanceAfter: 950,
        idempotencyKey: 'req-1:reserve',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { reserveAIUsage } = await import('../../lib/aiUsage.js');
      const result = await reserveAIUsage(createEnv({ USER_DB: db as unknown as D1Database }), {
        userId: 'user-1',
        routeKey: 'review',
        requestId: 'req-1',
        estimatedTokens: 50,
      });

      expect(result.routeKey).toBe('review');
      expect(result.reservedTokens).toBe(50);
      expect(mockApplyCreditMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          source: 'ai_review',
          amount: 50,
        }),
      );
    });

    it('reserves tokens successfully for generate-table route', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'consume:req-1:reserve',
        userId: 'user-1',
        kind: 'consume',
        source: 'ai_generate',
        amount: 200,
        balanceAfter: 800,
        idempotencyKey: 'req-1:reserve',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { reserveAIUsage } = await import('../../lib/aiUsage.js');
      const result = await reserveAIUsage(createEnv({ USER_DB: db as unknown as D1Database }), {
        userId: 'user-1',
        routeKey: 'generate-table',
        requestId: 'req-1',
        estimatedTokens: 200,
      });

      expect(result.routeKey).toBe('generate-table');
      expect(result.reservedTokens).toBe(200);
      expect(mockApplyCreditMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          source: 'ai_generate',
          amount: 200,
        }),
      );
    });

    it('fails when credit is exhausted', async () => {
      const mockApplyCreditMutation = vi.fn().mockRejectedValue(new Error('CREDIT_EXHAUSTED'));

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { reserveAIUsage } = await import('../../lib/aiUsage.js');
      await expect(
        reserveAIUsage(createEnv({ USER_DB: db as unknown as D1Database }), {
          userId: 'user-1',
          routeKey: 'explain',
          requestId: 'req-1',
          estimatedTokens: 100,
        }),
      ).rejects.toThrow('CREDIT_EXHAUSTED');

      // Verify failed usage event was written
      expect(db.run).toHaveBeenCalled();
    });

    it('normalizes zero tokens to 1', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'consume:req-1:reserve',
        userId: 'user-1',
        kind: 'consume',
        source: 'ai_explain',
        amount: 1,
        balanceAfter: 999,
        idempotencyKey: 'req-1:reserve',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { reserveAIUsage } = await import('../../lib/aiUsage.js');
      const result = await reserveAIUsage(createEnv({ USER_DB: db as unknown as D1Database }), {
        userId: 'user-1',
        routeKey: 'explain',
        requestId: 'req-1',
        estimatedTokens: 0,
      });

      expect(result.reservedTokens).toBe(1);
      expect(mockApplyCreditMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amount: 1 }),
      );
    });

    it('normalizes negative tokens to 1', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'consume:req-1:reserve',
        userId: 'user-1',
        kind: 'consume',
        source: 'ai_explain',
        amount: 1,
        balanceAfter: 999,
        idempotencyKey: 'req-1:reserve',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { reserveAIUsage } = await import('../../lib/aiUsage.js');
      const result = await reserveAIUsage(createEnv({ USER_DB: db as unknown as D1Database }), {
        userId: 'user-1',
        routeKey: 'explain',
        requestId: 'req-1',
        estimatedTokens: -10,
      });

      expect(result.reservedTokens).toBe(1);
      expect(mockApplyCreditMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amount: 1 }),
      );
    });

    it('rounds fractional tokens up', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'consume:req-1:reserve',
        userId: 'user-1',
        kind: 'consume',
        source: 'ai_explain',
        amount: 3,
        balanceAfter: 997,
        idempotencyKey: 'req-1:reserve',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { reserveAIUsage } = await import('../../lib/aiUsage.js');
      const result = await reserveAIUsage(createEnv({ USER_DB: db as unknown as D1Database }), {
        userId: 'user-1',
        routeKey: 'explain',
        requestId: 'req-1',
        estimatedTokens: 2.7,
      });

      expect(result.reservedTokens).toBe(3);
      expect(mockApplyCreditMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amount: 3 }),
      );
    });
  });

  describe('completeAIUsage', () => {
    it('refunds when actual tokens are less than reserved', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'refund:req-1:success',
        userId: 'user-1',
        kind: 'refund',
        source: 'ai_explain',
        amount: 30,
        balanceAfter: 930,
        idempotencyKey: 'req-1:refund-success',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { completeAIUsage } = await import('../../lib/aiUsage.js');
      await completeAIUsage(
        createEnv({ USER_DB: db as unknown as D1Database }),
        {
          usageEventId: 'usage:req-1',
          userId: 'user-1',
          routeKey: 'explain',
          requestId: 'req-1',
          reservedTokens: 100,
        },
        70,
      );

      // Verify refund was applied (amount = 100 - 70 = 30)
      expect(mockApplyCreditMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          kind: 'refund',
          amount: 30,
          idempotencyKey: 'usage:req-1:settlement',
          ledgerId: 'refund:usage:req-1:settlement',
        }),
      );
    });

    it('does not refund when actual tokens equal reserved', async () => {
      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: vi.fn().mockResolvedValue({}),
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { completeAIUsage } = await import('../../lib/aiUsage.js');
      await completeAIUsage(
        createEnv({ USER_DB: db as unknown as D1Database }),
        {
          usageEventId: 'usage:req-1',
          userId: 'user-1',
          routeKey: 'explain',
          requestId: 'req-1',
          reservedTokens: 100,
        },
        100,
      );

      // Only usage event update, no refund
      const { applyCreditMutation } = await import('../../lib/credits.js');
      expect(applyCreditMutation).not.toHaveBeenCalled();
    });

    it('charges when actual tokens exceed reserved', async () => {
      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: vi.fn().mockResolvedValue({}),
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { completeAIUsage } = await import('../../lib/aiUsage.js');
      await completeAIUsage(
        createEnv({ USER_DB: db as unknown as D1Database }),
        {
          usageEventId: 'usage:req-1',
          userId: 'user-1',
          routeKey: 'explain',
          requestId: 'req-1',
          reservedTokens: 100,
        },
        150,
      );

      const { applyCreditMutation } = await import('../../lib/credits.js');
      expect(applyCreditMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          kind: 'consume',
          amount: 50,
        }),
      );
    });

    it('uses reserved tokens when actualTotalTokens is null', async () => {
      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: vi.fn().mockResolvedValue({}),
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { completeAIUsage } = await import('../../lib/aiUsage.js');
      await completeAIUsage(
        createEnv({ USER_DB: db as unknown as D1Database }),
        {
          usageEventId: 'usage:req-1',
          userId: 'user-1',
          routeKey: 'explain',
          requestId: 'req-1',
          reservedTokens: 100,
        },
        null,
      );

      // No refund since actualTokens = reservedTokens = 100
      const { applyCreditMutation } = await import('../../lib/credits.js');
      expect(applyCreditMutation).not.toHaveBeenCalled();
    });

    it('rounds actual tokens and refunds difference', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'refund:req-1:success',
        userId: 'user-1',
        kind: 'refund',
        source: 'ai_explain',
        amount: 32,
        balanceAfter: 932,
        idempotencyKey: 'req-1:refund-success',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { completeAIUsage } = await import('../../lib/aiUsage.js');
      await completeAIUsage(
        createEnv({ USER_DB: db as unknown as D1Database }),
        {
          usageEventId: 'usage:req-1',
          userId: 'user-1',
          routeKey: 'explain',
          requestId: 'req-1',
          reservedTokens: 100,
        },
        68.4,
      );

      // Math.round(68.4) = 68, refund = 100 - 68 = 32
      expect(mockApplyCreditMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          kind: 'refund',
          amount: 32,
        }),
      );
    });

    it('handles zero actual tokens with full refund', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'refund:req-1:success',
        userId: 'user-1',
        kind: 'refund',
        source: 'ai_explain',
        amount: 100,
        balanceAfter: 1000,
        idempotencyKey: 'req-1:refund-success',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { completeAIUsage } = await import('../../lib/aiUsage.js');
      await completeAIUsage(
        createEnv({ USER_DB: db as unknown as D1Database }),
        {
          usageEventId: 'usage:req-1',
          userId: 'user-1',
          routeKey: 'explain',
          requestId: 'req-1',
          reservedTokens: 100,
        },
        0,
      );

      expect(mockApplyCreditMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          kind: 'refund',
          amount: 100,
        }),
      );
    });
  });

  describe('failAIUsage', () => {
    it('refunds full reserved amount on failure', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'refund:req-1:failed',
        userId: 'user-1',
        kind: 'refund',
        source: 'ai_explain',
        amount: 100,
        balanceAfter: 1000,
        idempotencyKey: 'req-1:refund-failed',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { failAIUsage } = await import('../../lib/aiUsage.js');
      await failAIUsage(
        createEnv({ USER_DB: db as unknown as D1Database }),
        {
          usageEventId: 'usage:req-1',
          userId: 'user-1',
          routeKey: 'explain',
          requestId: 'req-1',
          reservedTokens: 100,
        },
        'OPENAI_ERROR',
      );

      expect(mockApplyCreditMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          kind: 'refund',
          amount: 100,
          idempotencyKey: 'usage:req-1:settlement',
          ledgerId: 'refund:usage:req-1:settlement',
          metadata: expect.objectContaining({
            reason: 'request_failed',
            errorCode: 'OPENAI_ERROR',
          }),
        }),
      );
    });

    it('writes failed usage event with error code', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'refund:req-1:failed',
        userId: 'user-1',
        kind: 'refund',
        source: 'ai_generate',
        amount: 200,
        balanceAfter: 1100,
        idempotencyKey: 'req-1:refund-failed',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { failAIUsage } = await import('../../lib/aiUsage.js');
      await failAIUsage(
        createEnv({ USER_DB: db as unknown as D1Database }),
        {
          usageEventId: 'usage:req-1',
          userId: 'user-1',
          routeKey: 'generate-table',
          requestId: 'req-1',
          reservedTokens: 200,
        },
        'RATE_LIMITED',
      );

      // Check that usage event was written with failed status
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('usage_events'));
    });
  });

  describe('normalizeTokenAmount', () => {
    it('returns 1 for zero', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'consume:req-1:reserve',
        userId: 'user-1',
        kind: 'consume',
        source: 'ai_explain',
        amount: 1,
        balanceAfter: 999,
        idempotencyKey: 'req-1:reserve',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { reserveAIUsage } = await import('../../lib/aiUsage.js');
      const result = await reserveAIUsage(createEnv({ USER_DB: db as unknown as D1Database }), {
        userId: 'user-1',
        routeKey: 'explain',
        requestId: 'req-1',
        estimatedTokens: 0,
      });

      expect(result.reservedTokens).toBe(1);
    });

    it('returns 1 for negative values', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'consume:req-1:reserve',
        userId: 'user-1',
        kind: 'consume',
        source: 'ai_explain',
        amount: 1,
        balanceAfter: 999,
        idempotencyKey: 'req-1:reserve',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { reserveAIUsage } = await import('../../lib/aiUsage.js');
      const result = await reserveAIUsage(createEnv({ USER_DB: db as unknown as D1Database }), {
        userId: 'user-1',
        routeKey: 'explain',
        requestId: 'req-1',
        estimatedTokens: -5,
      });

      expect(result.reservedTokens).toBe(1);
    });

    it('returns 1 for NaN', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'consume:req-1:reserve',
        userId: 'user-1',
        kind: 'consume',
        source: 'ai_explain',
        amount: 1,
        balanceAfter: 999,
        idempotencyKey: 'req-1:reserve',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { reserveAIUsage } = await import('../../lib/aiUsage.js');
      const result = await reserveAIUsage(createEnv({ USER_DB: db as unknown as D1Database }), {
        userId: 'user-1',
        routeKey: 'explain',
        requestId: 'req-1',
        estimatedTokens: NaN,
      });

      expect(result.reservedTokens).toBe(1);
    });

    it('returns 1 for Infinity', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'consume:req-1:reserve',
        userId: 'user-1',
        kind: 'consume',
        source: 'ai_explain',
        amount: 1,
        balanceAfter: 999,
        idempotencyKey: 'req-1:reserve',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { reserveAIUsage } = await import('../../lib/aiUsage.js');
      const result = await reserveAIUsage(createEnv({ USER_DB: db as unknown as D1Database }), {
        userId: 'user-1',
        routeKey: 'explain',
        requestId: 'req-1',
        estimatedTokens: Infinity,
      });

      expect(result.reservedTokens).toBe(1);
    });

    it('returns 1 for -Infinity', async () => {
      const mockApplyCreditMutation = vi.fn().mockResolvedValue({
        id: 'consume:req-1:reserve',
        userId: 'user-1',
        kind: 'consume',
        source: 'ai_explain',
        amount: 1,
        balanceAfter: 999,
        idempotencyKey: 'req-1:reserve',
        relatedUsageId: 'usage:req-1',
        metadataJson: null,
        createdAt: '2026-04-11T00:00:00Z',
      });

      vi.doMock('../../lib/credits.js', () => ({
        applyCreditMutation: mockApplyCreditMutation,
      }));

      const db = createMockDb();
      db.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const { reserveAIUsage } = await import('../../lib/aiUsage.js');
      const result = await reserveAIUsage(createEnv({ USER_DB: db as unknown as D1Database }), {
        userId: 'user-1',
        routeKey: 'explain',
        requestId: 'req-1',
        estimatedTokens: -Infinity,
      });

      expect(result.reservedTokens).toBe(1);
    });
  });
});
