import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { ApiEnv } from '../../lib/context.js';

const RESERVATION = { usageEventId: 'usage-1', userId: 'user-1', reservedTokens: 100 };
const PROMPT_MESSAGES = [
  { role: 'system' as const, content: 'System prompt used by the model' },
  { role: 'user' as const, content: 'User prompt used by the model' },
];

const createEnv = (): ApiEnv['Bindings'] =>
  ({
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL_NAME: 'test-model',
    USER_DB: {} as D1Database,
  }) as ApiEnv['Bindings'];

/** 只放行治理外壳，把额度与限流的副作用换成可断言的 spy。 */
const loadShell = async (
  overrides: Record<string, unknown> = {},
  completionContent = '{}',
  streamResponse?: AsyncIterable<unknown>,
  finishReason = 'stop',
) => {
  const reserveAIUsage = vi.fn().mockResolvedValue(RESERVATION);
  const completeAIUsage = vi.fn().mockResolvedValue(undefined);
  const failAIUsage = vi.fn().mockResolvedValue(undefined);
  const openAIConstructor = vi.fn();
  vi.doMock('../../lib/requestRateLimit.js', () => ({
    enforceIpRateLimit: vi.fn().mockResolvedValue(null),
  }));

  vi.doMock('../../lib/auth.js', () => ({
    authenticateRequest:
      overrides.authenticateRequest ??
      vi.fn().mockResolvedValue({ userId: 'user-1', email: 'user@example.com' }),
  }));
  vi.doMock('../../lib/credits.js', () => ({
    grantSignupCredits: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock('../../lib/aiUsage.js', () => ({
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
      constructor(options: unknown) {
        openAIConstructor(options);
      }

      chat = {
        completions: {
          create: vi.fn().mockResolvedValue(
            streamResponse ?? {
              choices: [{ message: { content: completionContent }, finish_reason: finishReason }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            },
          ),
        },
      };
    },
  }));

  const { withAIGovernance, rejectAIRequest } = await import('../../lib/aiRoute.js');
  const { enforceOpenAIRateLimit } = await import('../../openaiControl.js');
  return {
    withAIGovernance,
    rejectAIRequest,
    reserveAIUsage,
    completeAIUsage,
    failAIUsage,
    openAIConstructor,
    enforceOpenAIRateLimit,
  };
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
    buildMessages: () => PROMPT_MESSAGES,
  };

  it('rejects anonymous requests before parsing or consuming AI quota', async () => {
    const { DomainError } = await import('../../lib/http.js');
    const shell = await loadShell({
      authenticateRequest: vi
        .fn()
        .mockRejectedValue(new DomainError(401, 'AUTH_REQUIRED', 'AUTH_REQUIRED')),
    });
    const parseRequest = vi.fn((body) => body);
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest }, async () => c.json({ ok: true })),
    );
    const response = await post(app, {});
    expect(response.status).toBe(401);
    expect(parseRequest).not.toHaveBeenCalled();
    expect(shell.enforceOpenAIRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    { label: '截断', content: '{"fields":[', reason: 'length' },
    { label: '过滤', content: '{"ok":true}', reason: 'content_filter' },
    { label: '缺少结束原因', content: '{"ok":true}', reason: null },
    { label: '非法 JSON', content: '{invalid', reason: 'stop' },
    { label: '空响应', content: '  ', reason: 'stop' },
    { label: '非对象 JSON', content: 'null', reason: 'stop' },
  ])('$label 的 JSON 流必须报错并退款', async ({ content, reason }) => {
    async function* upstream() {
      yield { choices: [{ delta: { content } }] };
      yield { choices: [{ delta: {}, finish_reason: reason }] };
    }
    const shell = await loadShell({}, '{}', upstream());
    const waitUntil = vi.fn();
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest: (body) => body }, async (session) =>
        session.streamCompletion({
          scope: 'test-json-stream',
          temperature: 0,
          jsonResponse: true,
          debugInput: {},
        }),
      ),
    );
    const response = await post(app, { sql: 'select 1' }, waitUntil);
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    await Promise.all(waitUntil.mock.calls.map(([task]) => task));
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      code: reason === 'length' ? 'AI_OUTPUT_TRUNCATED' : 'UPSTREAM_OPENAI_ERROR',
    });
    expect(events.some((event) => event.type === 'done')).toBe(false);
    expect(shell.completeAIUsage).not.toHaveBeenCalled();
    expect(shell.failAIUsage).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('完整流在读完最终 usage 后结算一次，JSON=%s', async (jsonResponse) => {
    const content = jsonResponse ? '{"ok":true}' : 'A complete explanation';
    async function* upstream() {
      yield { choices: [{ delta: { content: content.slice(0, 5) } }] };
      yield { choices: [{ delta: { content: content.slice(5) }, finish_reason: 'stop' }] };
      yield { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
    }
    const shell = await loadShell({}, '{}', upstream());
    const waitUntil = vi.fn();
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest: (body) => body }, async (session) =>
        session.streamCompletion({
          scope: 'test-stream',
          temperature: 0,
          jsonResponse,
          debugInput: {},
        }),
      ),
    );
    const response = await post(app, { sql: 'select 1' }, waitUntil);
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    await Promise.all(waitUntil.mock.calls.map(([task]) => task));
    expect(events).toEqual([
      { type: 'delta', text: content.slice(0, 5) },
      { type: 'delta', text: content.slice(5) },
      { type: 'done' },
    ]);
    expect(shell.completeAIUsage).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      RESERVATION,
      15,
    );
    expect(shell.failAIUsage).not.toHaveBeenCalled();
    expect(waitUntil).toHaveBeenCalledTimes(2);
  });

  it('非流式 JSON 同样拒绝截断结果，即使内容恰好可以解析', async () => {
    const shell = await loadShell({}, '{}', undefined, 'length');
    const waitUntil = vi.fn();
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest: (body) => body }, async (session) => {
        await session.completeJson({ scope: 'test-json', temperature: 0 });
        return c.json({ ok: true });
      }),
    );
    const response = await post(app, { sql: 'select 1' }, waitUntil);
    await Promise.all(waitUntil.mock.calls.map(([task]) => task));
    expect(response.status).toBe(502);
    expect(shell.completeAIUsage).not.toHaveBeenCalled();
    expect(shell.failAIUsage).toHaveBeenCalledWith(
      expect.anything(),
      RESERVATION,
      expect.any(String),
      15,
    );
  });

  it('protects the stream lifetime before upstream usage arrives and after cancellation', async () => {
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    async function* upstream() {
      yield { choices: [{ delta: { content: 'partial' } }] };
      await gate;
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
      yield { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
    }
    const shell = await loadShell({}, '{}', upstream());
    const waitUntil = vi.fn();
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest: (body) => body }, async (session) =>
        session.streamCompletion({ scope: 'test-cancel', temperature: 0, debugInput: {} }),
      ),
    );
    const response = await post(app, {}, waitUntil);
    if (!response.body) throw new Error('Missing stream response body');
    const reader = response.body.getReader();
    await reader.read();
    const protectedBeforeUsage = waitUntil.mock.calls.length;
    await reader.cancel();
    resume();
    await vi.waitFor(() => expect(shell.completeAIUsage).toHaveBeenCalled());
    await Promise.all(waitUntil.mock.calls.map(([task]) => task));
    expect(protectedBeforeUsage).toBeGreaterThan(0);
    expect(shell.completeAIUsage).toHaveBeenCalledWith(expect.anything(), RESERVATION, 15);
  });

  it.each([false, true])('流中途失败时发送错误终态并退款，已有输出=%s', async (hasOutput) => {
    async function* upstream() {
      if (hasOutput) yield { choices: [{ delta: { content: 'partial' } }] };
      throw new Error('upstream disconnected');
    }
    const shell = await loadShell({}, '{}', upstream());
    const waitUntil = vi.fn();
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest: (body) => body }, async (session) =>
        session.streamCompletion({ scope: 'test-stream', temperature: 0, debugInput: {} }),
      ),
    );

    const response = await post(app, { sql: 'select 1' }, waitUntil);
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    expect(events).toEqual([
      ...(hasOutput ? [{ type: 'delta', text: 'partial' }] : []),
      {
        type: 'error',
        error: 'Upstream OpenAI error',
        code: 'UPSTREAM_OPENAI_ERROR',
        requestId: 'unknown',
      },
    ]);
    expect(shell.completeAIUsage).not.toHaveBeenCalled();
    if (hasOutput) expect(shell.failAIUsage.mock.calls[0]?.[3]).toBeGreaterThan(0);
    else expect(shell.failAIUsage.mock.calls[0]?.[3]).toBeNull();
    expect(shell.failAIUsage).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(2);
    await Promise.all(waitUntil.mock.calls.map(([task]) => task));
  });

  it('使用实际模型消息预留额度', async () => {
    const shell = await loadShell();
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest: (body) => body }, async () =>
        c.json({ ok: true }),
      ),
    );

    await post(app, { sql: 'select 1' });

    expect(shell.reserveAIUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        estimatedTokens: 100 + Math.ceil(JSON.stringify(PROMPT_MESSAGES).length / 4),
      }),
    );
  });

  it('只由治理层重试并限制单次请求时长', async () => {
    const shell = await loadShell();
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest: (body) => body }, async () =>
        c.json({ ok: true }),
      ),
    );

    await post(app, { sql: 'select 1' });

    const options = shell.openAIConstructor.mock.calls[0]?.[0];
    expect(options).toMatchObject({ maxRetries: 0, timeout: 180_000 });
  });

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

  it('只向路由暴露请求与受治理的补全命令', async () => {
    const shell = await loadShell();
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest: (body) => body }, async (session) => {
        expect(Object.keys(session).sort()).toEqual([
          'completeJson',
          'request',
          'streamCompletion',
        ]);
        return c.json({ ok: true });
      }),
    );

    const response = await post(app, { sql: 'select 1' });

    expect(response.status).toBe(200);
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
      null,
    );
  });

  it('模型返回非法 JSON 时仍按已报告用量结算', async () => {
    const shell = await loadShell({}, '{invalid');
    const app = new Hono<ApiEnv>();
    app.post('/t', (c) =>
      shell.withAIGovernance(c, { ...spec, parseRequest: (body) => body }, async (session) => {
        await session.completeJson({
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
      15,
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
    expect(shell.enforceOpenAIRateLimit).not.toHaveBeenCalled();
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
