import { describe, expect, it, vi } from 'vitest';
import {
  dispatchTelegramAuditNotification,
  formatTelegramAuditMessage,
  shouldSendTelegramNotification,
} from '../lib/telegramNotifier';
import type { ApiEnv } from '../lib/context';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  SHARE_KV: {} as KVNamespace,
  RATE_LIMIT_KV: {} as KVNamespace,
  ...overrides,
});

const auditPayload = {
  requestId: 'req-1',
  route: 'review',
  status: 200,
  latencyMs: 123,
  retryCount: 1,
  rateLimitHit: false,
  estimatedTokens: 456,
  actualPromptTokens: 13,
  actualCompletionTokens: 26,
  actualTotalTokens: 39,
  model: 'gpt-4o-mini',
  budgetHit: false,
  budgetUsedTokens: 789,
};

describe('telegram notifier', () => {
  it('应仅在开关和必要配置完整时启用发送', () => {
    expect(shouldSendTelegramNotification(createEnv())).toBe(false);
    expect(
      shouldSendTelegramNotification(
        createEnv({
          TELEGRAM_NOTIFY_ENABLED: 'true',
          TELEGRAM_BOT_TOKEN: 'bot-token',
        }),
      ),
    ).toBe(false);
    expect(
      shouldSendTelegramNotification(
        createEnv({
          TELEGRAM_NOTIFY_ENABLED: 'true',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          TELEGRAM_CHAT_ID: 'chat-id',
        }),
      ),
    ).toBe(true);
  });

  it('应输出脱敏且稳定的 Telegram 文本', () => {
    const text = formatTelegramAuditMessage({
      ...auditPayload,
      status: 502,
      budgetHit: true,
      errorCode: 'UPSTREAM_OPENAI_ERROR',
    });

    expect(text).toContain('[LLM Usage] review');
    expect(text).toContain('actualPromptTokens: 13');
    expect(text).toContain('actualCompletionTokens: 26');
    expect(text).toContain('actualTotalTokens: 39');
    expect(text).toContain('estimatedTokens: 456');
    expect(text).toContain('budgetHit: yes');
    expect(text).toContain('errorCode: UPSTREAM_OPENAI_ERROR');
    expect(text).not.toContain('CREATE TABLE');
  });

  it('无真实 usage 时应回退为 n/a', () => {
    const text = formatTelegramAuditMessage({
      ...auditPayload,
      actualPromptTokens: null,
      actualCompletionTokens: null,
      actualTotalTokens: null,
    });

    expect(text).toContain('actualPromptTokens: n/a');
    expect(text).toContain('actualCompletionTokens: n/a');
    expect(text).toContain('actualTotalTokens: n/a');
  });

  it('应在发送失败时吞掉异常并记录 warning', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('fail', { status: 500 }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    dispatchTelegramAuditNotification(
      createEnv({
        TELEGRAM_NOTIFY_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: 'bot-token',
        TELEGRAM_CHAT_ID: 'chat-id',
      }),
      auditPayload,
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
