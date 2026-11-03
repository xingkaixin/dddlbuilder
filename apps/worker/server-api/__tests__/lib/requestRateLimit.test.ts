import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import { enforceRequestRateLimit } from '../../lib/requestRateLimit.js';

const policy = {
  scope: 'auth:signup',
  limit: 5,
  windowMs: 60_000,
};

const createTestEnv = (prepare: ReturnType<typeof vi.fn>, batch: ReturnType<typeof vi.fn>) => {
  // SAFETY: the rate-limit route only uses prepare and batch from this D1 test double.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the partial binding cannot implement the full platform interface.
  return { USER_DB: { prepare, batch } } as unknown as ApiEnv['Bindings'];
};

const createApp = (values: Array<number | undefined>) => {
  const bindings: unknown[][] = [];

  const prepare = vi.fn(() => ({
    bind: (...args: unknown[]) => {
      bindings.push(args);

      return { args };
    },
  }));
  const batch = vi.fn(async () => {
    const value = values.shift();

    return [
      {
        success: true,
        results: value == null ? [] : [{ value }],
      },
      {
        success: true,
        results: [],
      },
    ];
  });
  const app = new Hono<ApiEnv>();
  app.get('/', async (c) => c.json(await enforceRequestRateLimit(c, policy)));

  const env = createTestEnv(prepare, batch);

  return { app, env, bindings, batch };
};

describe('enforceRequestRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:30Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('denies requests when the atomic upsert returns no row', async () => {
    const { app, env } = createApp([undefined]);

    const response = await app.request(
      new Request('https://ddlbuilder.test/', {
        headers: { 'x-forwarded-for': '198.51.100.2, 198.51.100.3' },
      }),
      {},
      env,
    );

    expect(await response.json()).toEqual({
      allowed: false,
      limit: 5,
      remaining: 0,
      retryAfterSeconds: 30,
    });
  });
});
