import { describe, expect, it, vi } from 'vitest';
import { logOpenAIAudit } from '../openaiControl';
import type { ApiEnv } from '../lib/context';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  USER_DB: {} as D1Database,
  ...overrides,
});

describe('openai audit', () => {
  it('应将 Telegram 发送任务挂到 waitUntil', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    const waitUntil = vi.fn();

    logOpenAIAudit(
      createEnv({
        TELEGRAM_NOTIFY_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: 'bot-token',
        TELEGRAM_CHAT_ID: 'chat-id',
      }),
      {
        requestId: 'req-1',
        route: 'review',
        status: 200,
        latencyMs: 120,
        retryCount: 1,
        rateLimitHit: false,
        estimatedTokens: 456,
        actualPromptTokens: 13,
        actualCompletionTokens: 26,
        actualTotalTokens: 39,
        model: 'gpt-4o-mini',
        rateLimitEnabled: true,
        rateLimitStore: 'memory',
        rateLimitLimit: 20,
        rateLimitRemaining: 19,
        rateLimitWindowMs: 60_000,
        budgetHit: false,
        budgetEnabled: false,
        budgetLimitTokens: null,
        budgetUsedTokens: null,
      },
      waitUntil,
    );

    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [task] = waitUntil.mock.calls[0] as [Promise<unknown>];
    await task;

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    infoSpy.mockRestore();
    fetchSpy.mockRestore();
  });
});
