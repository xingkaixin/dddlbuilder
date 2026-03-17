import { afterEach, describe, expect, it, vi } from 'vitest';

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

const loadApp = async (env: Record<string, string | undefined>) => {
  restoreEnv();
  for (const [key, value] of Object.entries(env)) {
    if (value == null) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }

  vi.resetModules();
  const module = await import('../../api/index');
  return module.default;
};

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
  vi.resetModules();
});

describe.sequential('openai governance', () => {
  it('应基于 IP + UA + 路由进行匿名限流', async () => {
    const app = await loadApp({
      OPENAI_RATELIMIT_ENABLED: 'true',
      OPENAI_RATELIMIT_STORE: 'memory',
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
    expect(third.status).toBe(503);
  });

  it('应在 kv 计数模式下命中限流并在窗口后恢复', async () => {
    const app = await loadApp({
      OPENAI_RATELIMIT_ENABLED: 'true',
      OPENAI_RATELIMIT_STORE: 'kv',
      OPENAI_RATELIMIT_WINDOW_MS: '200',
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

    await new Promise((resolve) => setTimeout(resolve, 260));

    const third = await request();
    expect(third.status).toBe(503);
  });

  it('应在预算超限时返回统一错误格式', async () => {
    const app = await loadApp({
      OPENAI_RATELIMIT_ENABLED: 'true',
      OPENAI_RATELIMIT_STORE: 'memory',
      OPENAI_RATELIMIT_WINDOW_MS: '60000',
      OPENAI_RATELIMIT_GENERATE_MAX: '20',
      OPENAI_DAILY_BUDGET_ENABLED: 'true',
      OPENAI_DAILY_BUDGET_MAX_TOKENS: '5',
      OPENAI_API_KEY: undefined,
    });

    const response = await app.request(
      'https://ddlbuilder.test/api/generate-table',
      {
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
      },
    );

    expect(response.status).toBe(429);
    const payload = await response.json();
    expect(payload).toMatchObject({
      error: expect.any(String),
      code: 'BUDGET_EXCEEDED',
      requestId: expect.any(String),
    });
  });

  it('结构化审计日志不应包含 SQL/DDL 原文', async () => {
    const consoleInfoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => {});

    const app = await loadApp({
      OPENAI_RATELIMIT_ENABLED: 'true',
      OPENAI_RATELIMIT_STORE: 'memory',
      OPENAI_RATELIMIT_WINDOW_MS: '60000',
      OPENAI_RATELIMIT_REVIEW_MAX: '20',
      OPENAI_DAILY_BUDGET_ENABLED: 'false',
      OPENAI_API_KEY: undefined,
    });

    const sensitiveDDL =
      'CREATE TABLE secret_sensitive_table (card_no varchar(32));';

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

    const loggedText = consoleInfoSpy.mock.calls
      .map((args) => args.join(' '))
      .join('\n');

    expect(loggedText).toContain('openai_audit');
    expect(loggedText).not.toContain(sensitiveDDL);

    const auditPayloadRaw = consoleInfoSpy.mock.calls[0]?.[0];
    expect(typeof auditPayloadRaw).toBe('string');
    const auditPayload = JSON.parse(String(auditPayloadRaw)) as Record<
      string,
      unknown
    >;
    expect(auditPayload).toMatchObject({
      event: 'openai_audit',
      route: 'review',
      model: expect.any(String),
      maxOutputTokens: expect.any(Number),
      rateLimitEnabled: expect.any(Boolean),
      rateLimitStore: expect.stringMatching(/^(memory|kv)$/),
      budgetEnabled: expect.any(Boolean),
    });
    expect(auditPayload).toHaveProperty('budgetLimitTokens');
    expect(auditPayload).toHaveProperty('budgetUsedTokens');
  });
});
