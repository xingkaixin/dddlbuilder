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
  USER_DB: {} as D1Database,
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
  it.each([400, 401, 403, 429])('keeps routine %s rejections out of Telegram', async (status) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    try {
      await dispatchTelegramAuditNotification(
        createEnv({
          TELEGRAM_NOTIFY_ENABLED: 'true',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          TELEGRAM_CHAT_ID: 'chat-id',
        }),
        { ...auditPayload, status },
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
  it.each([{ status: 200 }, { status: 502 }, { status: 429, errorCode: 'BUDGET_EXCEEDED' }])(
    'notifies for usage and actionable failures: %j',
    async (outcome) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
      try {
        await dispatchTelegramAuditNotification(
          createEnv({
            TELEGRAM_NOTIFY_ENABLED: 'true',
            TELEGRAM_BOT_TOKEN: 'bot-token',
            TELEGRAM_CHAT_ID: 'chat-id',
          }),
          { ...auditPayload, ...outcome },
        );
        expect(fetchSpy).toHaveBeenCalledOnce();
      } finally {
        fetchSpy.mockRestore();
      }
    },
  );

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

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    fetchSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
