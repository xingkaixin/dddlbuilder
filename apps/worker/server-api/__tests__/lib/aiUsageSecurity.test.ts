import { describe, expect, it } from 'vitest';
import { completeAIUsage, failAIUsage, recordAIUsageAttempt } from '../../lib/aiUsage.js';
import { createCreditFixture } from '../helpers/creditFixture.js';

describe('usage identity and terminal state', () => {
  const observedUsage = (tokens: number) => ({
    observedTotalTokens: tokens,
    chargedTokens: tokens,
    providerBudgetTokens: tokens,
    usageEstimated: false,
  });

  const failedUsage = {
    observedTotalTokens: null,
    chargedTokens: 100,
    providerBudgetTokens: 100,
    usageEstimated: true,
  };

  it('uses server identities even when request ids are reused', async () => {
    const f = await createCreditFixture();
    try {
      const first = await f.reserve();
      const second = await f.reserve();
      expect(first.usageEventId).not.toBe(second.usageEventId);
      expect(await f.balance()).toBe(800);
      expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM usage_events').get()?.n).toBe(2);
    } finally {
      f.sqlite.close();
    }
  });

  it.each([true, false])(
    'keeps the first terminal settlement, succeeded=%s',
    async (successFirst) => {
      const f = await createCreditFixture();
      try {
        const reservation = await f.reserve();
        await recordAIUsageAttempt(f.env, reservation);
        if (successFirst) {
          await completeAIUsage(f.env, reservation, observedUsage(50));
          await failAIUsage(f.env, reservation, 'failure', failedUsage);
        } else {
          await failAIUsage(f.env, reservation, 'failure', failedUsage);
          await completeAIUsage(f.env, reservation, observedUsage(50));
        }
        expect(await f.balance()).toBe(successFirst ? 950 : 900);
        expect(f.sqlite.prepare('SELECT status FROM usage_events').get()?.status).toBe(
          successFirst ? 'succeeded' : 'failed',
        );
      } finally {
        f.sqlite.close();
      }
    },
  );

  it('does not settle another user’s reservation', async () => {
    const f = await createCreditFixture();
    try {
      const reservation = await f.reserve();
      await failAIUsage(f.env, { ...reservation, userId: 'another-user' }, 'failure', failedUsage);
      expect(await f.balance()).toBe(900);
      expect(f.sqlite.prepare('SELECT status FROM usage_events').get()?.status).toBe('reserved');
    } finally {
      f.sqlite.close();
    }
  });
});
