import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';

const createEnv = (db: D1Database): ApiEnv['Bindings'] =>
  ({
    USER_DB: db,
  }) as ApiEnv['Bindings'];

const createMockDb = () => {
  const run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare, bind, run };
};

describe('AI usage identity and settlement', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('scopes usage identity and credit idempotency to the user and route', async () => {
    const applyCreditMutation = vi.fn().mockResolvedValue({});
    vi.doMock('../../lib/credits.js', () => ({ applyCreditMutation }));
    const db = createMockDb();
    const { reserveAIUsage } = await import('../../lib/aiUsage.js');
    const env = createEnv(db as unknown as D1Database);

    const first = await reserveAIUsage(env, {
      userId: 'user-a',
      routeKey: 'explain',
      requestId: 'shared-request',
      estimatedTokens: 10,
    });
    const second = await reserveAIUsage(env, {
      userId: 'user-b',
      routeKey: 'review',
      requestId: 'shared-request',
      estimatedTokens: 10,
    });

    expect(first.usageEventId).not.toBe(second.usageEventId);
    expect(applyCreditMutation.mock.calls[0]?.[1].idempotencyKey).not.toBe(
      applyCreditMutation.mock.calls[1]?.[1].idempotencyKey,
    );
  });

  it('allows only one terminal settlement for a reservation', async () => {
    const applyCreditMutation = vi.fn().mockResolvedValue({});
    vi.doMock('../../lib/credits.js', () => ({ applyCreditMutation }));
    const db = createMockDb();
    const { completeAIUsage, failAIUsage } = await import('../../lib/aiUsage.js');
    const reservation = {
      usageEventId: 'usage-1',
      userId: 'user-1',
      routeKey: 'explain' as const,
      requestId: 'request-1',
      reservedTokens: 100,
    };

    await completeAIUsage(createEnv(db as unknown as D1Database), reservation, 50);
    db.run.mockResolvedValueOnce({ success: true, meta: { changes: 0 } });
    await failAIUsage(createEnv(db as unknown as D1Database), reservation, 'UPSTREAM_OPENAI_ERROR');

    expect(applyCreditMutation).toHaveBeenCalledTimes(1);
  });

  it('charges tokens used above the reservation', async () => {
    const applyCreditMutation = vi.fn().mockResolvedValue({});
    vi.doMock('../../lib/credits.js', () => ({ applyCreditMutation }));
    const db = createMockDb();
    const { completeAIUsage } = await import('../../lib/aiUsage.js');

    await completeAIUsage(
      createEnv(db as unknown as D1Database),
      {
        usageEventId: 'usage-1',
        userId: 'user-1',
        routeKey: 'generate-table',
        requestId: 'request-1',
        reservedTokens: 100,
      },
      140,
    );

    expect(applyCreditMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'consume',
        amount: 40,
      }),
    );
  });
});
