import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { ApiEnv } from '../../lib/context.js';

const RESERVATION = { usageEventId: 'usage-1', userId: 'user-1', reservedTokens: 100 };

const createEnv = (): ApiEnv['Bindings'] =>
  ({
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL_NAME: 'test-model',
    USER_DB: {} as D1Database,
  }) as ApiEnv['Bindings'];

/** 只放行治理外壳，把额度与限流的副作用换成可断言的 spy。 */
const loadShell = async (overrides: Record<string, unknown> = {}, completionContent = '{}') => {
  const reserveAIUsage = vi.fn().mockResolvedValue(RESERVATION);
  const completeAIUsage = vi.fn().mockResolvedValue(undefined);
  const failAIUsage = vi.fn().mockResolvedValue(undefined);

  vi.doMock('../../lib/aiUsage.js', () => ({
    authenticateAIUser: vi.fn().mockResolvedValue({ userId: 'user-1' }),
    reserveAIUsage,
    completeAIUsage,
    failAIUsage,
    ...overrides,
  }));
  vi.doMock('../../openaiControl.js', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('../../openaiControl.js');
    return {
      ...actual,
      enforceOpenAIRateLimit: vi.fn().mockResolvedValue({ remaining: 9, response: null }),
      enforceOpenAIDailyBudget: vi.fn().mockResolvedValue({ usedTokens: 0, response: null }),
      logOpenAIAudit: vi.fn(),
    };
  });
  vi.doMock('openai', () => ({
    default: class {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: completionContent } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        },
      };
    },
  }));

  const { withAIGovernance, rejectAIRequest } = await import('../../lib/aiRoute.js');
  return { withAIGovernance, rejectAIRequest, reserveAIUsage, completeAIUsage, failAIUsage };
};

const post = (app: Hono<ApiEnv>, body: unknown, waitUntil = vi.fn()) =>
  app.fetch(
    new Request('http://localhost/t', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    createEnv(),
    { waitUntil, passThroughOnException: () => {} } as ExecutionContext,
  );

describe('withAIGovernance', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  const spec = {
    route: 'explain' as const,
    maxOutputTokens: 100,
    bodyMaxBytes: 4096,
  };

  it('结算成功的请求并放行响应', async () => {
    const shell = await loadShell();
    const waitUntil = vi.fn();
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest: (body) => body }, async () =>
        c.json({ ok: true }),
      ),
    );

    const response = await post(app, { sql: 'select 1' }, waitUntil);

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(shell.completeAIUsage).toHaveBeenCalledTimes(1));
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(shell.failAIUsage).not.toHaveBeenCalled();
  });

  it('run 抛异常时退还已预留的额度', async () => {
    const shell = await loadShell();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest: (body) => body }, async () => {
        throw new Error('upstream exploded');
      }),
    );

    const response = await post(app, { sql: 'select 1' });

    expect(response.status).toBe(502);
    expect(shell.failAIUsage).toHaveBeenCalledWith(
      expect.anything(),
      RESERVATION,
      'UPSTREAM_OPENAI_ERROR',
    );
  });

  it('模型返回非法 JSON 时退还额度', async () => {
    const shell = await loadShell({}, '{invalid');
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest: (body) => body }, async (session) => {
        await session.completeJson({
          system: 'Return JSON',
          user: 'test',
          scope: 'test-json',
          temperature: 0,
        });
        return c.json({ ok: true });
      }),
    );

    const response = await post(app, { sql: 'select 1' });

    expect(response.status).toBe(502);
    expect(shell.completeAIUsage).not.toHaveBeenCalled();
    expect(shell.failAIUsage).toHaveBeenCalledWith(
      expect.anything(),
      RESERVATION,
      'UPSTREAM_OPENAI_ERROR',
    );
  });

  it('请求体被拒时不预留额度', async () => {
    const shell = await loadShell();
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(
        c,
        { ...spec, parseRequest: () => shell.rejectAIRequest('SQL_REQUIRED', 'SQL is required') },
        async () => c.json({ ok: true }),
      ),
    );

    const response = await post(app, {});

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'SQL_REQUIRED' });
    expect(shell.reserveAIUsage).not.toHaveBeenCalled();
  });

  it('额度不足时返回 402 且不调用 run', async () => {
    const run = vi.fn();
    const { DomainError } = await import('../../lib/http.js');
    const shell = await loadShell({
      reserveAIUsage: vi
        .fn()
        .mockRejectedValue(new DomainError(402, 'CREDIT_EXHAUSTED', 'Insufficient credits')),
    });
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest: (body) => body }, run),
    );

    const response = await post(app, { sql: 'select 1' });

    expect(response.status).toBe(402);
    expect(run).not.toHaveBeenCalled();
  });
});
