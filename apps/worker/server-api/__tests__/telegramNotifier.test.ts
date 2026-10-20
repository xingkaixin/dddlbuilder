import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatTelegramAIMessage, notifyAIOperation } from '../lib/telegramNotifier';
import type { ApiEnv } from '../lib/context';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  // SAFETY: notification tests never call KV; the empty object is an unused platform placeholder.
  SHARE_KV: {} as KVNamespace,
  // SAFETY: notification tests use only fetch and notification environment values, not D1.
  USER_DB: {} as D1Database,
  ...overrides,
});

const enabled = {
  TELEGRAM_NOTIFY_ENABLED: 'true',
  TELEGRAM_BOT_TOKEN: 'bot-token',
  TELEGRAM_CHAT_ID: 'chat-id',
};

const payload = {
  operationId: 'operation-1',
  route: 'review',
  outcome: 'succeeded' as const,
  model: 'claude-haiku-5-5',
  thinking: false,
  calls: 1,
  inputTokens: 13,
  outputTokens: 26,
  chargedTokens: 39,
  latencyMs: 123,
  error: null,
};

afterEach(() => vi.restoreAllMocks());

describe('telegram notifier', () => {
  it('sends only when the switch, token and chat are all configured', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const waitUntil = vi.fn();

    notifyAIOperation(createEnv(), payload, waitUntil);
    notifyAIOperation(createEnv({ ...enabled, TELEGRAM_CHAT_ID: '' }), payload, waitUntil);
    expect(waitUntil).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    notifyAIOperation(createEnv(enabled), payload, waitUntil);
    expect(waitUntil).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('keeps a failed send inside the background task', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('fail', { status: 500 }));
    const tasks: Promise<unknown>[] = [];

    notifyAIOperation(createEnv(enabled), payload, (promise) => tasks.push(promise));
    await expect(tasks[0]).resolves.toBeUndefined();
  });

  it('formats usage and failure details', () => {
    const text = formatTelegramAIMessage({
      ...payload,
      outcome: 'failed',
      latencyMs: null,
      error: 'UPSTREAM_OPENAI_ERROR',
    });

    expect(text).toContain('[LLM Usage] review');
    expect(text).toContain('outcome: failed');
    expect(text).toContain('chargedTokens: 39');
    expect(text).toContain('latencyMs: n/a');
    expect(text).toContain('error: UPSTREAM_OPENAI_ERROR');
  });
});
