import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv, WorkerRequestLogger } from '../lib/context.js';
import { logOpenAIAudit, type AuditLogPayload } from '../openaiControl.js';

const createRequestLogger = () => {
  const set = vi.fn();
  const audit = vi.fn();

  return {
    audit,
    logger: { set, audit } as unknown as WorkerRequestLogger,
    set,
  };
};

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  USER_DB: {} as D1Database,
  ...overrides,
});

const createPayload = (overrides: Partial<AuditLogPayload> = {}): AuditLogPayload => ({
  requestId: 'req-1',
  route: 'review',
  status: 200,
  latencyMs: 120,
  retryCount: 1,
  attemptCount: 2,
  rateLimitHit: false,
  estimatedTokens: 456,
  actualPromptTokens: 13,
  actualCompletionTokens: 26,
  actualTotalTokens: 39,
  chargedTokens: 39,
  providerBudgetTokens: 39,
  usageEstimated: false,
  accountingFinalized: true,
  userId: 'user-1',
  model: 'gpt-4o-mini',
  maxOutputTokens: 800,
  rateLimitEnabled: true,
  rateLimitStore: 'd1',
  rateLimitLimit: 20,
  rateLimitRemaining: 19,
  rateLimitWindowMs: 60_000,
  budgetHit: false,
  budgetEnabled: false,
  budgetLimitTokens: null,
  budgetUsedTokens: null,
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('openai audit', () => {
  it('应将计费事实写入请求宽事件并记录用户审计事件', () => {
    const { audit, logger, set } = createRequestLogger();
    const payload = createPayload();
    const waitUntil = vi.fn();

    logOpenAIAudit(createEnv({ EVLOG_REQUEST_LOG: logger }), payload, waitUntil);

    expect(set).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith({ ai: payload });
    expect(audit).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledWith({
      action: 'ai.request',
      actor: { type: 'user', id: 'user-1' },
      target: { type: 'ai_route', id: 'review', model: 'gpt-4o-mini' },
      outcome: 'success',
      correlationId: 'req-1',
    });
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('应记录 API 拒绝审计并将 Telegram 任务挂到 waitUntil', async () => {
    const { audit, logger, set } = createRequestLogger();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    const waitUntil = vi.fn();
    const payload = createPayload({
      status: 429,
      userId: null,
      errorCode: 'BUDGET_EXCEEDED',
      attemptCount: 0,
      retryCount: 0,
      actualPromptTokens: null,
      actualCompletionTokens: null,
      actualTotalTokens: null,
      chargedTokens: 0,
      providerBudgetTokens: 0,
      usageEstimated: false,
      budgetHit: true,
      budgetEnabled: true,
      budgetLimitTokens: 10_000,
      budgetUsedTokens: 10_000,
    });

    logOpenAIAudit(
      createEnv({
        EVLOG_REQUEST_LOG: logger,
        TELEGRAM_NOTIFY_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: 'bot-token',
        TELEGRAM_CHAT_ID: 'chat-id',
      }),
      payload,
      waitUntil,
    );

    expect(set).toHaveBeenCalledWith({ ai: payload });
    expect(audit).toHaveBeenCalledWith({
      action: 'ai.request',
      actor: { type: 'api', id: 'req-1' },
      target: { type: 'ai_route', id: 'review', model: 'gpt-4o-mini' },
      outcome: 'denied',
      reason: 'BUDGET_EXCEEDED',
      correlationId: 'req-1',
    });
    expect(waitUntil).toHaveBeenCalledOnce();

    const [task] = waitUntil.mock.calls[0] as [Promise<unknown>];
    await task;

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { text: string };
    expect(body.text).toContain('retryCount: 0');
    expect(body.text).toContain('budgetHit: yes');
  });
});
