import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import type * as OpenAIControl from '../openaiControl.js';
import { registerIndexAdvisorRoute } from '../routes/indexAdvisor.js';

const { createCompletion } = vi.hoisted(() => ({ createCompletion: vi.fn() }));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createCompletion } };
  },
}));

vi.mock('../lib/auth.js', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({ userId: 'user-1', email: 'user@example.com' }),
}));
vi.mock('../lib/credits.js', () => ({ grantSignupCredits: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/aiUsage.js', () => ({
  reserveAIUsage: vi.fn().mockImplementation(async (_env, input) => ({
    usageEventId: 'usage-1',
    userId: 'user-1',
    routeKey: input.routeKey,
    requestId: input.requestId,
    reservedTokens: input.estimatedTokens,
  })),
  recordAIUsageAttempt: vi.fn().mockResolvedValue(1),
  prepareAIUsageSettlement: vi.fn().mockResolvedValue({
    chargedTokens: 15,
    providerBudgetTokens: 15,
    needsFinalization: true,
  }),
  finalizeAIUsageSettlement: vi.fn().mockResolvedValue(true),
}));

vi.mock('../lib/aiBudget.js', () => ({
  settleAIDailyBudget: vi.fn().mockResolvedValue(null),
}));

vi.mock('../openaiControl.js', async (importOriginal) => ({
  ...(await importOriginal<typeof OpenAIControl>()),
  enforceOpenAIRateLimit: vi.fn().mockResolvedValue({ remaining: 9, response: null }),
  enforceOpenAIDailyBudget: vi.fn().mockResolvedValue({ usedTokens: 0, response: null }),
  logOpenAIAudit: vi.fn(),
}));

const requestAdvice = async (index?: unknown) => {
  createCompletion.mockResolvedValue({
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            summary: 'Index analysis',
            recommendations: [
              {
                category: 'missing_index',
                title: 'Email lookup',
                rationale: 'Match the supplied query',
                confidence: 'high',
                index,
              },
            ],
          }),
        },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });
  const app = new Hono<ApiEnv>();
  registerIndexAdvisorRoute(app);
  const tasks: Promise<unknown>[] = [];
  const env: ApiEnv['Bindings'] = {
    ASSETS: { fetch: globalThis.fetch },
    SHARE_KV: {} as KVNamespace,
    USER_DB: {} as D1Database,
    OPENAI_API_KEY: 'test-api-key',
  };
  const response = await app.fetch(
    new Request('http://localhost/index-advisor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dbType: 'mysql',
        tableName: 'users',
        fields: [
          { fieldName: 'id', fieldType: 'int' },
          { fieldName: 'email', fieldType: 'varchar(100)' },
        ],
        queryPatterns: 'SELECT * FROM users WHERE email = ?',
      }),
    }),
    env,
    {
      waitUntil: (task: Promise<unknown>) => tasks.push(task),
      passThroughOnException: () => {},
    } as unknown as ExecutionContext,
  );
  await Promise.all(tasks);
  expect(response.status).toBe(200);
  return response.json();
};

describe('index advisor result validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([true, false])('preserves complete indexes, unique=%s', async (unique) => {
    const fields = [
      { name: 'email', direction: 'DESC' },
      { name: 'id', direction: 'ASC' },
    ];
    const result = await requestAdvice({ name: 'idx_email_id', fields, unique });

    expect(result).toMatchObject({
      recommendations: [{ index: { name: 'idx_email_id', fields, unique } }],
    });
  });

  it.each([
    { label: 'unknown column', fields: [{ name: 'tenant_id' }, { name: 'email' }] },
    { label: 'empty column', fields: [{ name: ' ' }, { name: 'email' }] },
    { label: 'missing column name', fields: [{}, { name: 'email' }] },
    { label: 'null column', fields: [null, { name: 'email' }] },
    { label: 'primitive column', fields: [{ name: 'email' }, 1] },
    { label: 'no columns', fields: [] },
    { label: 'non-array columns', fields: 'email' },
  ])('rejects the whole index with $label but preserves advice', async ({ fields }) => {
    const result = await requestAdvice({ name: 'uk_tenant_email', fields, unique: true });

    expect(result).toMatchObject({
      summary: 'Index analysis',
      recommendations: [
        {
          id: 'rec_1',
          category: 'missing_index',
          title: 'Email lookup',
          rationale: 'Match the supplied query',
          confidence: 'high',
        },
      ],
    });
    expect(result).not.toHaveProperty('recommendations.0.index');
  });

  it('normalizes whitespace and default sort direction without changing columns', async () => {
    const result = await requestAdvice({
      name: ' idx_email ',
      fields: [{ name: ' email ' }],
    });

    expect(result).toMatchObject({
      recommendations: [
        {
          index: {
            name: 'idx_email',
            fields: [{ name: 'email', direction: 'ASC' }],
            unique: false,
          },
        },
      ],
    });
  });

  it('preserves advice without an index', async () => {
    const result = await requestAdvice();

    expect(result).toMatchObject({ recommendations: [{ title: 'Email lookup' }] });
    expect(result).not.toHaveProperty('recommendations.0.index');
  });
});
