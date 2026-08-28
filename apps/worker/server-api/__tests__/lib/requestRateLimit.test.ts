import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import { enforceRequestRateLimit } from '../../lib/requestRateLimit.js';

const policy = {
  scope: 'auth:signup',
  limit: 5,
  windowMs: 60_000,
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
  const env = {
    USER_DB: { prepare, batch } as unknown as D1Database,
  } as ApiEnv['Bindings'];
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

  it('increments the current window and reports remaining capacity', async () => {
    const { app, env, bindings, batch } = createApp([2]);
    const response = await app.request(
      new Request('https://ddlbuilder.test/', {
        headers: { 'cf-connecting-ip': '203.0.113.10' },
      }),
      {},
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      allowed: true,
      limit: 5,
      remaining: 3,
      retryAfterSeconds: 30,
    });
    expect(bindings).toHaveLength(1);
    expect(batch).toHaveBeenCalledOnce();
    expect(bindings[0]).toEqual([
      'auth:signup',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.any(String),
      expect.any(Number),
      5,
    ]);
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

  it('uses a stable anonymous subject when proxy headers are absent', async () => {
    const first = createApp([1]);
    const second = createApp([1]);

    await first.app.request('https://ddlbuilder.test/', {}, first.env);
    await second.app.request('https://ddlbuilder.test/', {}, second.env);

    expect(first.bindings[0]?.[1]).toBe(second.bindings[0]?.[1]);
  });
});
