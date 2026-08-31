import type { ApiEnv } from './context.js';
import { readEnvBool } from './env.js';
import type { AIRouteKey } from './aiRouteKey.js';

type RateLimitRule = {
  maxRequests: number;
  windowMs: number;
};

export type OpenAIConfig = {
  defaultWindowMs: number;
  rateLimitEnabled: boolean;
  requestTimeoutMs: number;
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  dailyBudgetEnabled: boolean;
  dailyBudgetMaxTokens: number;
  streamDebugEnabled: boolean;
  rateLimitRules: Record<AIRouteKey, RateLimitRule>;
};

const readEnvInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed) || parsed <= 0 || parsed > Number.MAX_SAFE_INTEGER) {
    return fallback;
  }
  const normalized = Math.floor(parsed);
  return Number.isSafeInteger(normalized) ? normalized : fallback;
};

export const buildOpenAIConfig = (env: ApiEnv['Bindings']): OpenAIConfig => {
  const defaultWindowMs = readEnvInt(env.OPENAI_RATELIMIT_WINDOW_MS, 60_000);
  const requestTimeoutMs = Math.min(readEnvInt(env.OPENAI_REQUEST_TIMEOUT_MS, 180_000), 600_000);
  const retryMaxAttempts = Math.min(readEnvInt(env.OPENAI_RETRY_MAX_ATTEMPTS, 3), 10);
  const retryBaseDelayMs = Math.min(readEnvInt(env.OPENAI_RETRY_BASE_DELAY_MS, 400), 60_000);
  const retryMaxDelayMs = Math.min(readEnvInt(env.OPENAI_RETRY_MAX_DELAY_MS, 3_000), 60_000);

  return {
    defaultWindowMs,
    rateLimitEnabled: readEnvBool(env.OPENAI_RATELIMIT_ENABLED, true),
    requestTimeoutMs,
    retryMaxAttempts,
    retryBaseDelayMs,
    retryMaxDelayMs,
    dailyBudgetEnabled: readEnvBool(env.OPENAI_DAILY_BUDGET_ENABLED, false),
    dailyBudgetMaxTokens: readEnvInt(env.OPENAI_DAILY_BUDGET_MAX_TOKENS, 0),
    streamDebugEnabled: readEnvBool(env.OPENAI_STREAM_DEBUG, false),
    rateLimitRules: {
      explain: {
        maxRequests: readEnvInt(env.OPENAI_RATELIMIT_EXPLAIN_MAX, 15),
        windowMs: defaultWindowMs,
      },
      review: {
        maxRequests: readEnvInt(env.OPENAI_RATELIMIT_REVIEW_MAX, 6),
        windowMs: defaultWindowMs,
      },
      'generate-table': {
        maxRequests: readEnvInt(env.OPENAI_RATELIMIT_GENERATE_MAX, 4),
        windowMs: defaultWindowMs,
      },
      'generate-comments': {
        maxRequests: readEnvInt(env.OPENAI_RATELIMIT_GENERATE_COMMENTS_MAX, 6),
        windowMs: defaultWindowMs,
      },
      'index-advisor': {
        maxRequests: readEnvInt(env.OPENAI_RATELIMIT_INDEX_ADVISOR_MAX, 6),
        windowMs: defaultWindowMs,
      },
    },
  };
};

const AI_USAGE_RECLAIM_MIN_TTL_MS = 15 * 60 * 1000;
const AI_USAGE_RECLAIM_SAFETY_MS = 5 * 60 * 1000;

export const getAIExecutionTimeoutMs = (config: OpenAIConfig) => {
  const retryDelays = Math.max(0, config.retryMaxAttempts - 1) * config.retryMaxDelayMs;
  return config.retryMaxAttempts * config.requestTimeoutMs + retryDelays;
};

export const getAIUsageReclaimTtlMs = (config: OpenAIConfig) =>
  Math.max(
    AI_USAGE_RECLAIM_MIN_TTL_MS,
    getAIExecutionTimeoutMs(config) + AI_USAGE_RECLAIM_SAFETY_MS,
  );
