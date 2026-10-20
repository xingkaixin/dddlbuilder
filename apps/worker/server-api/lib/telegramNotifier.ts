import type { ApiEnv } from './context.js';
import { readEnvBool } from './env.js';
import { logWorkerBackgroundError } from './logging.js';

export type AIOperationNotification = {
  operationId: string;
  route: string;
  outcome: 'succeeded' | 'failed';
  model: string;
  thinking: boolean;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  chargedTokens: number;
  latencyMs: number | null;
  error: string | null;
};

type TelegramNotifyConfig = {
  enabled: boolean;
  botToken: string | null;
  chatId: string | null;
};

const readTelegramNotifyConfig = (env: ApiEnv['Bindings']): TelegramNotifyConfig => ({
  enabled: readEnvBool(env.TELEGRAM_NOTIFY_ENABLED, false),
  botToken: env.TELEGRAM_BOT_TOKEN?.trim() || null,
  chatId: env.TELEGRAM_CHAT_ID?.trim() || null,
});

export const formatTelegramAIMessage = (payload: AIOperationNotification) => {
  const lines = [
    `[LLM Usage] ${payload.route}`,
    `outcome: ${payload.outcome}`,
    `operationId: ${payload.operationId}`,
    `model: ${payload.model}`,
    `thinking: ${payload.thinking ? 'on' : 'off'}`,
    `calls: ${payload.calls}`,
    `inputTokens: ${payload.inputTokens}`,
    `outputTokens: ${payload.outputTokens}`,
    `chargedTokens: ${payload.chargedTokens}`,
    `latencyMs: ${payload.latencyMs ?? 'n/a'}`,
  ];

  if (payload.error) lines.push(`error: ${payload.error}`);

  return lines.join('\n');
};

const sendTelegramMessage = async (
  { botToken, chatId }: { botToken: string; chatId: string },
  text: string,
) => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_notification: true,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`TELEGRAM_SEND_FAILED:${response.status}:${bodyText}`);
  }
};

export const notifyAIOperation = (
  env: ApiEnv['Bindings'],
  payload: AIOperationNotification,
  waitUntil: (promise: Promise<unknown>) => void,
) => {
  const { enabled, botToken, chatId } = readTelegramNotifyConfig(env);

  if (!enabled || !botToken || !chatId) return;

  waitUntil(
    sendTelegramMessage({ botToken, chatId }, formatTelegramAIMessage(payload)).catch((error) =>
      logWorkerBackgroundError(
        error,
        { job: 'telegram-ai-audit', operationId: payload.operationId, route: payload.route },
        waitUntil,
        env.ENVIRONMENT,
      ),
    ),
  );
};
