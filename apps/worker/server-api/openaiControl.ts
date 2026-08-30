import type { Context } from 'hono';
import type { ApiEnv } from './lib/context.js';
import { dispatchTelegramAuditNotification } from './lib/telegramNotifier.js';
import { errorResponse, type ApiErrorCode } from './lib/http.js';
import type { AIRouteKey } from './lib/aiRouteKey.js';
import { reserveAIDailyBudget } from './lib/aiBudget.js';
import type { OpenAIConfig } from './lib/openaiConfig.js';
import { logWorkerBackgroundError } from './lib/logging.js';

export { buildOpenAIConfig } from './lib/openaiConfig.js';
export { withOpenAIRetry } from './lib/openaiRetry.js';
export type { OpenAIRetryResult } from './lib/openaiRetry.js';

export type AuditLogPayload = {
  requestId: string;
  route: AIRouteKey;
  status: number;
  latencyMs: number;
  retryCount: number;
  attemptCount: number;
  rateLimitHit: boolean;
  estimatedTokens: number;
  actualPromptTokens: number | null;
  actualCompletionTokens: number | null;
  actualTotalTokens: number | null;
  chargedTokens: number | null;
  providerBudgetTokens: number | null;
  usageEstimated: boolean | null;
  accountingFinalized: boolean;
  userId: string | null;
  model?: string;
  maxOutputTokens?: number;
  rateLimitEnabled: boolean;
  rateLimitStore: 'd1';
  rateLimitLimit: number | null;
  rateLimitRemaining: number | null;
  rateLimitWindowMs: number | null;
  budgetHit?: boolean;
  budgetEnabled: boolean;
  budgetLimitTokens: number | null;
  budgetUsedTokens: number | null;
  errorCode?: ApiErrorCode;
};

export type OpenAIUsageSnapshot = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type WaitUntilFn = (promise: Promise<unknown>) => void;

export type GovernanceSnapshot = {
  rateLimitEnabled: boolean;
  rateLimitStore: 'd1';
  rateLimitLimit: number | null;
  rateLimitWindowMs: number | null;
  budgetEnabled: boolean;
  budgetLimitTokens: number | null;
};

const toUtf8Bytes = (input: string) => new TextEncoder().encode(input).length;

const estimateValueBytes = (value: unknown): number => {
  if (value == null) return 0;
  if (typeof value === 'string') return toUtf8Bytes(value);
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return toUtf8Bytes(String(value));
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized ? toUtf8Bytes(serialized) : 0;
  } catch {
    return 0;
  }
};

export const estimateRequestTokens = (payload: unknown, maxOutputTokens = 0): number => {
  const estimatedInputTokens = Math.max(1, estimateValueBytes(payload));
  const outputTokens = Math.max(0, Math.floor(maxOutputTokens));
  return Math.min(Number.MAX_SAFE_INTEGER, estimatedInputTokens + outputTokens);
};

export const getOpenAIGovernanceSnapshot = (
  routeKey: AIRouteKey,
  config: OpenAIConfig,
): GovernanceSnapshot => {
  const rule = config.rateLimitRules[routeKey];
  return {
    rateLimitEnabled: config.rateLimitEnabled,
    rateLimitStore: 'd1',
    rateLimitLimit: config.rateLimitEnabled ? rule.maxRequests : null,
    rateLimitWindowMs: config.rateLimitEnabled ? rule.windowMs : null,
    budgetEnabled: config.dailyBudgetEnabled,
    budgetLimitTokens:
      config.dailyBudgetEnabled && config.dailyBudgetMaxTokens > 0
        ? config.dailyBudgetMaxTokens
        : null,
  };
};

const reserveCounterCapacity = async (
  env: ApiEnv['Bindings'],
  scope: string,
  subject: string,
  windowId: string,
  amount: number,
  limit: number,
  expiresAt: number,
): Promise<number | null> => {
  const safeAmount = Math.max(1, Math.floor(amount));
  const row = await env.USER_DB.prepare(
    `
      INSERT INTO ai_governance_counters (
        scope,
        subject,
        window_id,
        value,
        expires_at
      )
      SELECT ?, ?, ?, ?, ?
      WHERE ? <= ?
      ON CONFLICT(scope, subject) DO UPDATE SET
        window_id = excluded.window_id,
        value = CASE
          WHEN ai_governance_counters.window_id = excluded.window_id
            THEN ai_governance_counters.value + excluded.value
          ELSE excluded.value
        END,
        expires_at = excluded.expires_at
      WHERE (
        CASE
          WHEN ai_governance_counters.window_id = excluded.window_id
            THEN ai_governance_counters.value + excluded.value
          ELSE excluded.value
        END
      ) <= ?
      RETURNING value
    `,
  )
    .bind(scope, subject, windowId, safeAmount, expiresAt, safeAmount, limit, limit)
    .first<{ value: number }>();
  return row ? Number(row.value) : null;
};

export async function enforceOpenAIRateLimit(
  c: Context<ApiEnv>,
  routeKey: AIRouteKey,
  config: OpenAIConfig,
  userId: string,
): Promise<{
  response: Response | null;
  rateLimitHit: boolean;
  limit: number | null;
  remaining: number | null;
  windowMs: number | null;
}> {
  if (!config.rateLimitEnabled) {
    return {
      response: null,
      rateLimitHit: false,
      limit: null,
      remaining: null,
      windowMs: null,
    };
  }

  const rule = config.rateLimitRules[routeKey];
  const now = Date.now();
  const windowBucket = Math.floor(now / rule.windowMs);
  const count = await reserveCounterCapacity(
    c.env,
    `rate:${routeKey}`,
    userId,
    String(windowBucket),
    1,
    rule.maxRequests,
    now + rule.windowMs + 5_000,
  );
  const remaining = count === null ? 0 : Math.max(rule.maxRequests - count, 0);

  c.header('X-RateLimit-Limit', String(rule.maxRequests));
  c.header('X-RateLimit-Remaining', String(remaining));
  c.header('X-RateLimit-Window-Ms', String(rule.windowMs));

  if (count !== null) {
    return {
      response: null,
      rateLimitHit: false,
      limit: rule.maxRequests,
      remaining,
      windowMs: rule.windowMs,
    };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((rule.windowMs - (now % rule.windowMs)) / 1000));

  c.header('Retry-After', String(retryAfterSeconds));

  return {
    response: errorResponse(c, 429, '请求过于频繁，请稍后再试', 'RATE_LIMIT_EXCEEDED'),
    rateLimitHit: true,
    limit: rule.maxRequests,
    remaining: 0,
    windowMs: rule.windowMs,
  };
}

export async function enforceOpenAIDailyBudget(
  c: Context<ApiEnv>,
  usageEventId: string,
  estimatedTokens: number,
  config: OpenAIConfig,
): Promise<{
  response: Response | null;
  budgetHit: boolean;
  limitTokens: number | null;
  usedTokens: number | null;
}> {
  if (!config.dailyBudgetEnabled || config.dailyBudgetMaxTokens <= 0) {
    return {
      response: null,
      budgetHit: false,
      limitTokens: null,
      usedTokens: null,
    };
  }

  const maximumAttemptBudget =
    estimatedTokens > Math.floor(Number.MAX_SAFE_INTEGER / config.retryMaxAttempts)
      ? Number.MAX_SAFE_INTEGER
      : estimatedTokens * config.retryMaxAttempts;

  const usedTokens = await reserveAIDailyBudget(
    c.env,
    usageEventId,
    maximumAttemptBudget,
    config.dailyBudgetMaxTokens,
  );

  c.header('X-Budget-Limit-Tokens', String(config.dailyBudgetMaxTokens));
  c.header('X-Budget-Used-Tokens', String(usedTokens ?? config.dailyBudgetMaxTokens));

  if (usedTokens !== null) {
    return {
      response: null,
      budgetHit: false,
      limitTokens: config.dailyBudgetMaxTokens,
      usedTokens,
    };
  }

  return {
    response: errorResponse(c, 429, '服务预算已达上限，请稍后再试', 'BUDGET_EXCEEDED'),
    budgetHit: true,
    limitTokens: config.dailyBudgetMaxTokens,
    usedTokens: config.dailyBudgetMaxTokens,
  };
}

export function logOpenAIAudit(
  env: ApiEnv['Bindings'],
  payload: AuditLogPayload,
  waitUntil: WaitUntilFn,
) {
  const log = env.EVLOG_REQUEST_LOG;
  log?.set({ ai: payload });
  log?.audit({
    action: 'ai.request',
    actor: payload.userId
      ? { type: 'user', id: payload.userId }
      : { type: 'api', id: payload.requestId },
    target: {
      type: 'ai_route',
      id: payload.route,
      ...(payload.model ? { model: payload.model } : {}),
    },
    outcome:
      payload.status < 400
        ? 'success'
        : payload.status === 401 || payload.status === 402 || payload.status === 429
          ? 'denied'
          : 'failure',
    ...(payload.errorCode ? { reason: payload.errorCode } : {}),
    correlationId: payload.requestId,
  });

  const notifyTask = dispatchTelegramAuditNotification(env, payload);

  if (notifyTask) {
    waitUntil(
      notifyTask.catch((error) => {
        logWorkerBackgroundError(
          error,
          {
            job: 'telegram-ai-audit',
            requestId: payload.requestId,
            route: payload.route,
          },
          waitUntil,
          env.ENVIRONMENT,
        );
      }),
    );
  }
}

export const readUsageFromStreamChunk = (chunk: unknown): OpenAIUsageSnapshot | null => {
  if (!chunk || typeof chunk !== 'object') {
    return null;
  }

  const usage = (chunk as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const promptTokens = (usage as { prompt_tokens?: unknown }).prompt_tokens;
  const completionTokens = (usage as { completion_tokens?: unknown }).completion_tokens;
  const totalTokens = (usage as { total_tokens?: unknown }).total_tokens;

  if (
    typeof promptTokens !== 'number' ||
    typeof completionTokens !== 'number' ||
    typeof totalTokens !== 'number'
  ) {
    return null;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
};
