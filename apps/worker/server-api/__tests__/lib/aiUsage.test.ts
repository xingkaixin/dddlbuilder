import { describe, expect, it, vi } from 'vitest';
import { completeAIUsage, failAIUsage, reserveAIUsage } from '../../lib/aiUsage.js';
import { createCreditFixture } from '../helpers/creditFixture.js';

describe('atomic AI usage', () => {
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
    [150, 900],
    [null, 900],
    [0, 1000],
  ] as const)('settles success at %s with balance %s', async (actual, expected) => {
    const f = await createCreditFixture();
    try {
      const reservation = await f.reserve();
      await completeAIUsage(f.env, reservation, actual);
      expect(await f.balance()).toBe(expected);
      expect(f.sqlite.prepare('SELECT status FROM usage_events').get()?.status).toBe('succeeded');
    } finally {
      f.sqlite.close();
    }
  });

  it.each([
    [null, 1000],
    [60, 940],
  ] as const)('settles failed usage %s', async (actual, expected) => {
    const f = await createCreditFixture();
    try {
      const reservation = await f.reserve();
      await failAIUsage(f.env, reservation, 'UPSTREAM_OPENAI_ERROR', actual);
      expect(await f.balance()).toBe(expected);
      expect(f.sqlite.prepare('SELECT status, error_code FROM usage_events').get()).toEqual({
        status: 'failed',
        error_code: 'UPSTREAM_OPENAI_ERROR',
      });
    } finally {
      f.sqlite.close();
    }
  });

  it('rolls back a refund if the final usage write fails, then retries once', async () => {
    const f = await createCreditFixture();
    try {
      const reservation = await f.reserve();
      f.sqlite.exec(
        "CREATE TRIGGER fail_settlement BEFORE UPDATE ON usage_events BEGIN SELECT RAISE(ABORT, 'injected failure'); END;",
      );
      await expect(completeAIUsage(f.env, reservation, 60)).rejects.toThrow('injected failure');
      expect(await f.balance()).toBe(900);
      expect(f.sqlite.prepare('SELECT status FROM usage_events').get()?.status).toBe('reserved');
      f.sqlite.exec('DROP TRIGGER fail_settlement');
      await completeAIUsage(f.env, reservation, 60);
      await completeAIUsage(f.env, reservation, 60);
      expect(await f.balance()).toBe(940);
      expect(
        f.sqlite.prepare("SELECT COUNT(*) AS n FROM credit_ledger WHERE kind = 'refund'").get()?.n,
      ).toBe(1);
    } finally {
      f.sqlite.close();
    }
  });
});
