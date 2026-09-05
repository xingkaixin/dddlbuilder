import { completeAIUsage, failAIUsage } from '../helpers/aiUsageSettlement.js';
import { describe, expect, it, vi } from 'vitest';
import { reclaimStaleAIUsage, recordAIUsageAttempt, reserveAIUsage } from '../../lib/aiUsage.js';
import { applyCreditMutation } from '../../lib/credits.js';
import { createCreditFixture } from '../helpers/creditFixture.js';

describe('atomic AI usage', () => {
  const observedUsage = (tokens: number, usageEstimated = false) => ({
    observedTotalTokens: tokens,
    chargedTokens: tokens,
    providerBudgetTokens: tokens,
    usageEstimated,
  });

  const estimatedUsage = (tokens: number) => ({
    observedTotalTokens: null,
    chargedTokens: tokens,
    providerBudgetTokens: tokens,
    usageEstimated: true,
  });

  it.each(['explain', 'review', 'generate-table', 'generate-comments', 'index-advisor'] as const)(
    'reserves %s in one transaction',
    async (routeKey) => {
      const f = await createCreditFixture();
      try {
        const batch = vi.spyOn(f.env.USER_DB, 'batch');
        const reservation = await reserveAIUsage(f.env, {
          userId: 'user-1',
          routeKey,
          requestId: 'request',
          estimatedTokens: 100,
        });
        expect(batch).toHaveBeenCalledTimes(1);
        expect(await f.balance()).toBe(900);
        expect(
          f.sqlite
            .prepare('SELECT status FROM usage_events WHERE id = ?')
            .get(reservation.usageEventId),
        ).toEqual({ status: 'reserved' });
        expect(
          f.sqlite.prepare("SELECT source FROM credit_ledger WHERE kind = 'consume'").get()?.source,
        ).toBe(
          routeKey === 'explain'
            ? 'ai_explain'
            : routeKey === 'review'
              ? 'ai_review'
              : 'ai_generate',
        );
      } finally {
        f.sqlite.close();
      }
    },
  );

  it.each([
    [0, 1],
    [-10, 1],
    [2.7, 3],
  ])('normalizes estimated tokens %s to %s', async (input, expected) => {
    const f = await createCreditFixture();
    try {
      expect((await f.reserve(input)).reservedTokens).toBe(expected);
    } finally {
      f.sqlite.close();
    }
  });

  it.each([NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe tokens %s without writing',
    async (amount) => {
      const f = await createCreditFixture();
      try {
        await expect(f.reserve(amount)).rejects.toThrow('INVALID_CREDIT_AMOUNT');
        expect(await f.balance()).toBe(1000);
        expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM usage_events').get()?.n).toBe(0);
      } finally {
        f.sqlite.close();
      }
    },
  );

  it.each([1.4, -1, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid settlement facts %s',
    async (tokens) => {
      const f = await createCreditFixture();
      try {
        const reservation = await f.reserve();
        await recordAIUsageAttempt(f.env, reservation);
        await expect(
          completeAIUsage(f.env, reservation, {
            observedTotalTokens: tokens,
            chargedTokens: tokens,
            providerBudgetTokens: tokens,
            usageEstimated: false,
          }),
        ).rejects.toThrow('INVALID_CREDIT_AMOUNT');
        expect(f.sqlite.prepare('SELECT status FROM usage_events').get()?.status).toBe('reserved');
      } finally {
        f.sqlite.close();
      }
    },
  );

  it('does not leave an event when the account is missing', async () => {
    const f = await createCreditFixture();
    try {
      await expect(
        reserveAIUsage(f.env, {
          userId: 'missing',
          routeKey: 'explain',
          requestId: 'r',
          estimatedTokens: 100,
        }),
      ).rejects.toThrow('CREDIT_ACCOUNT_MISSING');
      expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM usage_events').get()?.n).toBe(0);
    } finally {
      f.sqlite.close();
    }
  });

  it.each([
    [70, 930],
    [100, 900],
    [150, 850],
    [0, 1000],
  ] as const)('settles observed success at %s with balance %s', async (actual, expected) => {
    const f = await createCreditFixture();
    try {
      const reservation = await f.reserve();
      await recordAIUsageAttempt(f.env, reservation);
      await completeAIUsage(f.env, reservation, observedUsage(actual));
      expect(await f.balance()).toBe(expected);
      expect(
        f.sqlite
          .prepare(
            'SELECT status, actual_total_tokens, charged_tokens, provider_budget_tokens, attempt_count, usage_is_estimated FROM usage_events',
          )
          .get(),
      ).toEqual({
        status: 'succeeded',
        actual_total_tokens: actual,
        charged_tokens: actual,
        provider_budget_tokens: actual,
        attempt_count: 1,
        usage_is_estimated: 0,
      });
    } finally {
      f.sqlite.close();
    }
  });

  it('retains the reservation for an attempted request with unknown usage', async () => {
    const f = await createCreditFixture();
    try {
      const reservation = await f.reserve();
      await recordAIUsageAttempt(f.env, reservation);
      await failAIUsage(
        f.env,
        reservation,
        'UPSTREAM_OPENAI_ERROR',
        estimatedUsage(reservation.reservedTokens),
      );
      expect(await f.balance()).toBe(900);
      expect(
        f.sqlite
          .prepare(
            'SELECT status, error_code, actual_total_tokens, charged_tokens, provider_budget_tokens, usage_is_estimated FROM usage_events',
          )
          .get(),
      ).toEqual({
        status: 'failed',
        error_code: 'UPSTREAM_OPENAI_ERROR',
        actual_total_tokens: null,
        charged_tokens: 100,
        provider_budget_tokens: 100,
        usage_is_estimated: 1,
      });
    } finally {
      f.sqlite.close();
    }
  });

  it('fully refunds a request that never reached the provider', async () => {
    const f = await createCreditFixture();
    try {
      const reservation = await f.reserve();
      await failAIUsage(f.env, reservation, 'BUDGET_EXCEEDED', observedUsage(0));
      expect(await f.balance()).toBe(1000);
      expect(f.sqlite.prepare('SELECT attempt_count FROM usage_events').get()?.attempt_count).toBe(
        0,
      );
    } finally {
      f.sqlite.close();
    }
  });

  it('rejects a stale zero settlement after an attempt was durably recorded', async () => {
    const f = await createCreditFixture();
    try {
      const reservation = await f.reserve();
      await recordAIUsageAttempt(f.env, reservation);
      await failAIUsage(f.env, reservation, 'UPSTREAM_OPENAI_ERROR', observedUsage(0));

      expect(f.sqlite.prepare('SELECT status FROM usage_events').get()?.status).toBe('reserved');
      f.sqlite.prepare('UPDATE usage_events SET created_at = 1').run();
      expect(await reclaimStaleAIUsage(f.env)).toEqual({
        scanned: 1,
        reclaimed: 1,
        failures: [],
      });
      expect(await f.balance()).toBe(900);
      expect(f.sqlite.prepare('SELECT status FROM usage_events').get()?.status).toBe('failed');
    } finally {
      f.sqlite.close();
    }
  });

  it('persists a successful intent when supplemental credit is temporarily unavailable', async () => {
    const f = await createCreditFixture(100);
    try {
      const reservation = await f.reserve();
      await recordAIUsageAttempt(f.env, reservation);

      await expect(completeAIUsage(f.env, reservation, observedUsage(150))).rejects.toThrow(
        'CREDIT_EXHAUSTED',
      );
      expect(await f.balance()).toBe(0);
      expect(
        f.sqlite
          .prepare(
            'SELECT status, actual_total_tokens, charged_tokens FROM usage_events WHERE id = ?',
          )
          .get(reservation.usageEventId),
      ).toEqual({
        status: 'settling_succeeded',
        actual_total_tokens: 150,
        charged_tokens: 150,
      });

      await applyCreditMutation(f.env, {
        userId: reservation.userId,
        kind: 'grant',
        source: 'manual_adjustment',
        amount: 100,
        idempotencyKey: 'recovery-grant',
      });
      await expect(f.reserve(50, 'request-after-debt')).rejects.toThrow(
        'CREDIT_SETTLEMENT_PENDING',
      );
      expect(await f.balance()).toBe(100);
      await completeAIUsage(f.env, reservation, observedUsage(150));
      await completeAIUsage(f.env, reservation, observedUsage(150));

      expect(await f.balance()).toBe(50);
      expect(
        f.sqlite
          .prepare(
            "SELECT COUNT(*) AS n FROM credit_ledger WHERE idempotency_key LIKE '%:settlement'",
          )
          .get()?.n,
      ).toBe(1);
      expect(f.sqlite.prepare('SELECT status FROM usage_events').get()?.status).toBe('succeeded');
    } finally {
      f.sqlite.close();
    }
  });

  it('keeps settlement facts when the ledger transaction fails, then retries once', async () => {
    const f = await createCreditFixture();
    try {
      const reservation = await f.reserve();
      await recordAIUsageAttempt(f.env, reservation);
      f.sqlite.exec(
        "CREATE TRIGGER fail_settlement BEFORE INSERT ON credit_ledger WHEN NEW.id LIKE 'refund:%' BEGIN SELECT RAISE(ABORT, 'injected failure'); END;",
      );
      await expect(completeAIUsage(f.env, reservation, observedUsage(60))).rejects.toThrow(
        'injected failure',
      );
      expect(await f.balance()).toBe(900);
      expect(f.sqlite.prepare('SELECT status FROM usage_events').get()?.status).toBe(
        'settling_succeeded',
      );
      f.sqlite.exec('DROP TRIGGER fail_settlement');
      await completeAIUsage(f.env, reservation, observedUsage(60));
      await completeAIUsage(f.env, reservation, observedUsage(60));
      expect(await f.balance()).toBe(940);
      expect(
        f.sqlite.prepare("SELECT COUNT(*) AS n FROM credit_ledger WHERE kind = 'refund'").get()?.n,
      ).toBe(1);
    } finally {
      f.sqlite.close();
    }
  });
});
