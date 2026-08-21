import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';
import type { Hono } from 'hono';

const ORIGINAL_ENV = { ...process.env };

const restoreEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value == null) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
};

const createCounterDatabase = (): D1Database => {
  const counters = new Map<string, { windowId: string; value: number }>();
  return {
    prepare: vi.fn().mockReturnValue({
      bind: (
        scope: string,
        subject: string,
        windowId: string,
        amount: number,
        _expiresAt: number,
        _safeAmount: number,
        limit: number,
      ) => ({
        first: async () => {
          const key = `${scope}:${subject}`;
          const current = counters.get(key);
          const nextValue = current?.windowId === windowId ? current.value + amount : amount;
          if (nextValue > limit) {
            return null;
          }
          counters.set(key, { windowId, value: nextValue });
          return { value: nextValue };
        },
      }),
    }),
  } as unknown as D1Database;
};

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  USER_DB: createCounterDatabase(),
  ...overrides,
});

// Wrapper to make app.fetch with env easier to use
const createAppWrapper = (
  app: Hono<ApiEnv>,
  env: ApiEnv['Bindings'],
): {
  request: (path: string, options?: RequestInit) => Promise<Response>;
} => ({
  request: async (path: string, options: RequestInit = {}) => {
    const url = path.startsWith('http')
      ? path
      : `http://localhost${path.startsWith('/') ? path : `/${path}`}`;
    const request = new Request(url, options);
    return app.fetch(request, env);
  },
});

const createMockStream = (chunks: unknown[]) => ({
  async *[Symbol.asyncIterator]() {
    for (const chunk of chunks) {
      yield chunk;
    }
  },
});

let authenticateAIUserMock = vi.fn().mockResolvedValue({
  userId: 'user-1',
  email: 'user@example.com',
  emailVerified: true,
  name: 'User One',
});
let reserveAIUsageMock = vi.fn().mockImplementation(async (_env, input) => ({
  usageEventId: `usage:${input.requestId}`,
  userId: input.userId,
  routeKey: input.routeKey,
  requestId: input.requestId,
  reservedTokens: input.estimatedTokens,
}));
let completeAIUsageMock = vi.fn().mockResolvedValue(undefined);
let failAIUsageMock = vi.fn().mockResolvedValue(undefined);

const mockAIUsageModule = async (options?: {
  authenticateError?: string;
  reserveError?: string;
}) => {
  // DomainError 必须在 resetModules 之后的模块图里构造，否则 instanceof 跨实例失效
  const domainError = async (
    status: 401 | 402,
    code: 'AUTH_REQUIRED' | 'CREDIT_EXHAUSTED',
    message: string,
  ) => {
    const { DomainError } = await import('../lib/http.js');
    return new DomainError(status, code, message);
  };

  authenticateAIUserMock = options?.authenticateError
    ? vi
        .fn()
        .mockRejectedValue(
          options.authenticateError === 'AUTH_REQUIRED'
            ? await domainError(401, 'AUTH_REQUIRED', 'Authentication required')
            : new Error(options.authenticateError),
        )
    : vi.fn().mockResolvedValue({
        userId: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User One',
      });

  reserveAIUsageMock = options?.reserveError
    ? vi
        .fn()
        .mockRejectedValue(
          options.reserveError === 'CREDIT_EXHAUSTED'
            ? await domainError(402, 'CREDIT_EXHAUSTED', 'Insufficient credits')
            : new Error(options.reserveError),
        )
    : vi.fn().mockImplementation(async (_env, input) => ({
        usageEventId: `usage:${input.requestId}`,
        userId: input.userId,
        routeKey: input.routeKey,
        requestId: input.requestId,
        reservedTokens: input.estimatedTokens,
      }));

  completeAIUsageMock = vi.fn().mockResolvedValue(undefined);
  failAIUsageMock = vi.fn().mockResolvedValue(undefined);

  vi.doMock('../lib/aiUsage.js', () => ({
    authenticateAIUser: authenticateAIUserMock,
    reserveAIUsage: reserveAIUsageMock,
    completeAIUsage: completeAIUsageMock,
    failAIUsage: failAIUsageMock,
  }));
};

const loadAppWithOpenAIMock = async (
  envConfig: Record<string, string | undefined>,
  createCompletionMock: ReturnType<typeof vi.fn>,
  aiUsageOptions?: {
    authenticateError?: string;
    reserveError?: string;
  },
) => {
  restoreEnv();
  for (const [key, value] of Object.entries(envConfig)) {
    if (value == null) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }

  vi.resetModules();
  await mockAIUsageModule(aiUsageOptions);
  vi.doMock('openai', () => ({
    default: class OpenAI {
      chat = {
        completions: {
          create: createCompletionMock,
        },
      };
    },
  }));

  const module = await import('../../api/index');
  const app = module.default as Hono<ApiEnv>;
  const env = createEnv(
    Object.fromEntries(Object.entries(envConfig).filter(([, v]) => v !== undefined)) as Partial<
      ApiEnv['Bindings']
    >,
  );

  return createAppWrapper(app, env);
};

const loadAuthenticatedApp = async (
  envConfig: Record<string, string | undefined>,
  aiUsageOptions?: {
    authenticateError?: string;
    reserveError?: string;
  },
) => {
  restoreEnv();
  for (const [key, value] of Object.entries(envConfig)) {
    if (value == null) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }

  vi.resetModules();
  await mockAIUsageModule(aiUsageOptions);
  const module = await import('../../api/index');
  const app = module.default as Hono<ApiEnv>;
  const env = createEnv(
    Object.fromEntries(Object.entries(envConfig).filter(([, v]) => v !== undefined)) as Partial<
      ApiEnv['Bindings']
    >,
  );

  return createAppWrapper(app, env);
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('openai');
  vi.doUnmock('../lib/aiUsage.js');
  restoreEnv();
  vi.resetModules();
});

// 限流窗口按 Date.now() 对齐分桶，真实时钟下相邻两次请求可能落到不同窗口，必须固定时间
const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');
const SHORT_WINDOW_MS = 200;

describe.sequential('openai governance', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应基于 IP 和路由限流且不允许通过更换 UA 绕过', async () => {
    const app = await loadAuthenticatedApp({
      OPENAI_RATELIMIT_ENABLED: 'true',
      OPENAI_RATELIMIT_WINDOW_MS: '60000',
      OPENAI_RATELIMIT_EXPLAIN_MAX: '1',
      OPENAI_DAILY_BUDGET_ENABLED: 'false',
      OPENAI_API_KEY: undefined,
    });

    const request = (userAgent: string) =>
      app.request('https://ddlbuilder.test/api/explain', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '1.1.1.1',
          'user-agent': userAgent,
        },
        body: JSON.stringify({
          sql: 'select 1',
          context: '',
        }),
      });

    const first = await request('test-ua-A');
    expect(first.status).toBe(503);

    const second = await request('test-ua-A');
    expect(second.status).toBe(429);
    const secondPayload = await second.json();
    expect(secondPayload).toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
      requestId: expect.any(String),
    });

    const third = await request('test-ua-B');
    expect(third.status).toBe(429);
  });

  it('应在 D1 原子计数模式下命中限流并在窗口后恢复', async () => {
    const app = await loadAuthenticatedApp({
      OPENAI_RATELIMIT_ENABLED: 'true',
      OPENAI_RATELIMIT_WINDOW_MS: String(SHORT_WINDOW_MS),
      OPENAI_RATELIMIT_EXPLAIN_MAX: '1',
      OPENAI_DAILY_BUDGET_ENABLED: 'false',
      OPENAI_API_KEY: undefined,
    });

    const request = () =>
      app.request('https://ddlbuilder.test/api/explain', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '2.2.2.2',
          'user-agent': 'test-ua-redis',
        },
        body: JSON.stringify({
          sql: 'select 1',
          context: '',
        }),
      });

    const first = await request();
    expect(first.status).toBe(503);

    const second = await request();
    expect(second.status).toBe(429);

    vi.setSystemTime(FIXED_NOW.getTime() + SHORT_WINDOW_MS);

    const third = await request();
    expect(third.status).toBe(503);
  });

  it('应在预算超限时返回统一错误格式', async () => {
    const app = await loadAuthenticatedApp({
      OPENAI_RATELIMIT_ENABLED: 'true',
      OPENAI_RATELIMIT_WINDOW_MS: '60000',
      OPENAI_RATELIMIT_GENERATE_MAX: '20',
      OPENAI_DAILY_BUDGET_ENABLED: 'true',
      OPENAI_DAILY_BUDGET_MAX_TOKENS: '5',
      OPENAI_API_KEY: 'test-key',
    });

    const response = await app.request('https://ddlbuilder.test/api/generate-table', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '3.3.3.3',
        'user-agent': 'budget-test',
      },
      body: JSON.stringify({
        description: '生成一个包含多字段和索引的大表结构',
        dbType: 'mysql',
        templates: [],
        existingConfig: null,
        conversationHistory: [],
      }),
    });

    expect(response.status).toBe(429);
    const payload = await response.json();
    expect(payload).toMatchObject({
      error: expect.any(String),
      code: 'BUDGET_EXCEEDED',
      requestId: expect.any(String),
    });
  });

  it('结构化审计日志不应包含 SQL/DDL 原文', async () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const app = await loadAuthenticatedApp({
      OPENAI_RATELIMIT_ENABLED: 'true',
      OPENAI_RATELIMIT_WINDOW_MS: '60000',
      OPENAI_RATELIMIT_REVIEW_MAX: '20',
      OPENAI_DAILY_BUDGET_ENABLED: 'false',
      OPENAI_API_KEY: undefined,
    });

    const sensitiveDDL = 'CREATE TABLE secret_sensitive_table (card_no varchar(32));';

    const response = await app.request('https://ddlbuilder.test/api/review', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '4.4.4.4',
        'user-agent': 'log-test',
      },
      body: JSON.stringify({
        ddl: sensitiveDDL,
        tableName: 'secret_sensitive_table',
        dbType: 'mysql',
      }),
    });

    expect(response.status).toBe(503);

    const loggedText = consoleInfoSpy.mock.calls.map((args) => args.join(' ')).join('\n');

    expect(loggedText).toContain('openai_audit');
    expect(loggedText).not.toContain(sensitiveDDL);

    const auditPayloadRaw = consoleInfoSpy.mock.calls[0]?.[0];
    expect(typeof auditPayloadRaw).toBe('string');
    const auditPayload = JSON.parse(String(auditPayloadRaw)) as Record<string, unknown>;
    expect(auditPayload).toMatchObject({
      event: 'openai_audit',
      route: 'review',
      model: expect.any(String),
      maxOutputTokens: expect.any(Number),
      rateLimitEnabled: expect.any(Boolean),
      rateLimitStore: 'd1',
      budgetEnabled: expect.any(Boolean),
    });
    expect(auditPayload).toHaveProperty('budgetLimitTokens');
    expect(auditPayload).toHaveProperty('budgetUsedTokens');
  });

  it('开启 Telegram 通知后应在审计时异步发送消息', async () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

    const app = await loadAuthenticatedApp({
      OPENAI_RATELIMIT_ENABLED: 'true',
      OPENAI_RATELIMIT_WINDOW_MS: '60000',
      OPENAI_RATELIMIT_REVIEW_MAX: '20',
      OPENAI_DAILY_BUDGET_ENABLED: 'false',
      OPENAI_API_KEY: undefined,
      TELEGRAM_NOTIFY_ENABLED: 'true',
      TELEGRAM_BOT_TOKEN: 'bot-token',
      TELEGRAM_CHAT_ID: 'chat-id',
    });

    const response = await app.request('https://ddlbuilder.test/api/review', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '5.5.5.5',
        'user-agent': 'telegram-test',
      },
      body: JSON.stringify({
        ddl: 'CREATE TABLE t1(id bigint);',
        tableName: 't1',
        dbType: 'mysql',
      }),
    });

    expect(response.status).toBe(503);
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleInfoSpy).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/botbot-token/sendMessage');
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('estimatedTokens');
  });

  it('Telegram 发送失败时不应影响主请求', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('fail', { status: 500 }));

    const app = await loadAuthenticatedApp({
      OPENAI_RATELIMIT_ENABLED: 'true',
      OPENAI_RATELIMIT_WINDOW_MS: '60000',
      OPENAI_RATELIMIT_EXPLAIN_MAX: '20',
      OPENAI_DAILY_BUDGET_ENABLED: 'false',
      OPENAI_API_KEY: undefined,
      TELEGRAM_NOTIFY_ENABLED: 'true',
      TELEGRAM_BOT_TOKEN: 'bot-token',
      TELEGRAM_CHAT_ID: 'chat-id',
    });

    const response = await app.request('https://ddlbuilder.test/api/explain', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '6.6.6.6',
        'user-agent': 'telegram-fail-test',
      },
      body: JSON.stringify({
        sql: 'select 1',
        context: '',
      }),
    });

    expect(response.status).toBe(503);
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('匿名 AI 请求应返回 AUTH_REQUIRED', async () => {
    const app = await loadAuthenticatedApp(
      {
        OPENAI_RATELIMIT_ENABLED: 'true',
        OPENAI_RATELIMIT_WINDOW_MS: '60000',
        OPENAI_RATELIMIT_EXPLAIN_MAX: '20',
        OPENAI_DAILY_BUDGET_ENABLED: 'false',
        OPENAI_API_KEY: 'test-key',
      },
      { authenticateError: 'AUTH_REQUIRED' },
    );

    const response = await app.request('https://ddlbuilder.test/api/explain', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '8.8.8.8',
        'user-agent': 'anonymous-test',
      },
      body: JSON.stringify({
        sql: 'select 1',
        context: '',
      }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('额度不足时应返回 CREDIT_EXHAUSTED', async () => {
    const app = await loadAuthenticatedApp(
      {
        OPENAI_RATELIMIT_ENABLED: 'true',
        OPENAI_RATELIMIT_WINDOW_MS: '60000',
        OPENAI_RATELIMIT_REVIEW_MAX: '20',
        OPENAI_DAILY_BUDGET_ENABLED: 'false',
        OPENAI_API_KEY: 'test-key',
      },
      { reserveError: 'CREDIT_EXHAUSTED' },
    );

    const response = await app.request('https://ddlbuilder.test/api/review', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '9.9.9.9',
        'user-agent': 'credit-exhausted-test',
      },
      body: JSON.stringify({
        ddl: 'CREATE TABLE t1(id bigint);',
        tableName: 't1',
        dbType: 'mysql',
      }),
    });

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      code: 'CREDIT_EXHAUSTED',
    });
  });

  it('额度不足的请求不应占用全局预算', async () => {
    const createCompletionMock = vi.fn().mockResolvedValue(
      createMockStream([
        {
          choices: [{ delta: { content: '{"ok":true}' } }],
        },
        {
          choices: [],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 10,
            total_tokens: 20,
          },
        },
      ]),
    );
    const app = await loadAppWithOpenAIMock(
      {
        OPENAI_RATELIMIT_ENABLED: 'true',
        OPENAI_RATELIMIT_REVIEW_MAX: '20',
        OPENAI_DAILY_BUDGET_ENABLED: 'true',
        OPENAI_DAILY_BUDGET_MAX_TOKENS: '3000',
        OPENAI_API_KEY: 'test-key',
      },
      createCompletionMock,
    );
    const { DomainError } = await import('../lib/http.js');
    reserveAIUsageMock
      .mockRejectedValueOnce(new DomainError(402, 'CREDIT_EXHAUSTED', 'Insufficient credits'))
      .mockImplementationOnce(async (_env, input) => ({
        usageEventId: `usage:${input.requestId}`,
        userId: input.userId,
        routeKey: input.routeKey,
        requestId: input.requestId,
        reservedTokens: input.estimatedTokens,
      }));
    const request = () =>
      app.request('https://ddlbuilder.test/api/review', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '10.10.10.10',
        },
        body: JSON.stringify({
          ddl: 'CREATE TABLE t1(id bigint);',
          tableName: 't1',
          dbType: 'mysql',
        }),
      });

    expect((await request()).status).toBe(402);
    expect((await request()).status).toBe(200);
    expect(createCompletionMock).toHaveBeenCalledTimes(1);
  });

  it('流式响应应请求真实 usage，且不透传 usage chunk', async () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    const createCompletionMock = vi.fn().mockResolvedValue(
      createMockStream([
        {
          choices: [{ delta: { content: '{"ok":' } }],
        },
        {
          choices: [{ delta: { content: 'true}' } }],
        },
        {
          choices: [],
          usage: {
            prompt_tokens: 13,
            completion_tokens: 26,
            total_tokens: 39,
          },
        },
      ]),
    );

    const app = await loadAppWithOpenAIMock(
      {
        OPENAI_RATELIMIT_ENABLED: 'true',
        OPENAI_RATELIMIT_WINDOW_MS: '60000',
        OPENAI_RATELIMIT_REVIEW_MAX: '20',
        OPENAI_DAILY_BUDGET_ENABLED: 'false',
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL_NAME: 'qwen3.5-flash',
        TELEGRAM_NOTIFY_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: 'bot-token',
        TELEGRAM_CHAT_ID: 'chat-id',
      },
      createCompletionMock,
    );

    const response = await app.request('https://ddlbuilder.test/api/review', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '7.7.7.7',
        'user-agent': 'usage-stream-test',
      },
      body: JSON.stringify({
        ddl: 'CREATE TABLE t1(id bigint);',
        tableName: 't1',
        dbType: 'mysql',
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"ok":true}');

    expect(createCompletionMock).toHaveBeenCalledTimes(1);
    expect(createCompletionMock.mock.calls[0]?.[0]).toMatchObject({
      stream: true,
      stream_options: {
        include_usage: true,
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    const auditPayload = consoleInfoSpy.mock.calls
      .map(([value]) => JSON.parse(String(value)) as Record<string, unknown>)
      .find((payload) => payload.event === 'openai_audit');

    expect(auditPayload).toMatchObject({
      actualPromptTokens: 13,
      actualCompletionTokens: 26,
      actualTotalTokens: 39,
      estimatedTokens: expect.any(Number),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[1]?.body)).toContain('actualTotalTokens: 39');
    expect(String(fetchSpy.mock.calls[0]?.[1]?.body)).toContain('estimatedTokens:');
    expect(authenticateAIUserMock).toHaveBeenCalledTimes(1);
    expect(reserveAIUsageMock).toHaveBeenCalledTimes(1);
    expect(completeAIUsageMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        routeKey: 'review',
      }),
      39,
    );
    expect(failAIUsageMock).not.toHaveBeenCalled();
  });
});
