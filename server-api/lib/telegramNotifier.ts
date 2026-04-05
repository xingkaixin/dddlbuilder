import type { ApiEnv } from './context.js';

type AuditNotificationPayload = {
  requestId: string;
  route: string;
  status: number;
  latencyMs: number;
  retryCount: number;
  rateLimitHit: boolean;
  estimatedTokens: number;
  actualPromptTokens: number | null;
  actualCompletionTokens: number | null;
  actualTotalTokens: number | null;
  model?: string;
  maxOutputTokens?: number;
  budgetHit?: boolean;
  budgetUsedTokens?: number | null;
  errorCode?: string;
};

type TelegramNotifyConfig = {
  enabled: boolean;
  botToken: string | null;
  chatId: string | null;
};

const readEnvBool = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const readTelegramNotifyConfig = (env: ApiEnv['Bindings']): TelegramNotifyConfig => ({
  enabled: readEnvBool(env.TELEGRAM_NOTIFY_ENABLED, false),
  botToken: env.TELEGRAM_BOT_TOKEN?.trim() || null,
  chatId: env.TELEGRAM_CHAT_ID?.trim() || null,
});

export const shouldSendTelegramNotification = (env: ApiEnv['Bindings']) => {
  const config = readTelegramNotifyConfig(env);
  return config.enabled && Boolean(config.botToken) && Boolean(config.chatId);
};

export const formatTelegramAuditMessage = (payload: AuditNotificationPayload) => {
  const lines = [
    `[LLM Usage] ${payload.route}`,
    `status: ${payload.status}`,
    `requestId: ${payload.requestId}`,
    `actualPromptTokens: ${payload.actualPromptTokens ?? 'n/a'}`,
    `actualCompletionTokens: ${payload.actualCompletionTokens ?? 'n/a'}`,
    `actualTotalTokens: ${payload.actualTotalTokens ?? 'n/a'}`,
    `estimatedTokens: ${payload.estimatedTokens}`,
    `latencyMs: ${payload.latencyMs}`,
    `model: ${payload.model || 'unknown'}`,
    `retryCount: ${payload.retryCount}`,
    `rateLimitHit: ${payload.rateLimitHit ? 'yes' : 'no'}`,
    `budgetHit: ${payload.budgetHit ? 'yes' : 'no'}`,
  ];

  if (payload.budgetUsedTokens != null) {
    lines.push(`budgetUsedTokens: ${payload.budgetUsedTokens}`);
  }

  if (payload.errorCode) {
    lines.push(`errorCode: ${payload.errorCode}`);
  }

  return lines.join('\n');
};

export const sendTelegramAuditNotification = async (
  env: ApiEnv['Bindings'],
  payload: AuditNotificationPayload,
) => {
  const config = readTelegramNotifyConfig(env);
  if (!config.enabled || !config.botToken || !config.chatId) {
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: config.chatId,
      text: formatTelegramAuditMessage(payload),
      disable_notification: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`TELEGRAM_SEND_FAILED:${response.status}`);
  }
};

export const dispatchTelegramAuditNotification = (
  env: ApiEnv['Bindings'],
  payload: AuditNotificationPayload,
) => {
  if (!shouldSendTelegramNotification(env)) {
    return;
  }

  void sendTelegramAuditNotification(env, payload).catch((error) => {
    console.warn('[TelegramNotifier] Failed to send audit notification', error);
  });
};
