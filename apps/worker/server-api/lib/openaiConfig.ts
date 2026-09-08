import * as Config from 'effect/Config';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
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

const integer = (name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER) =>
  Config.string(name).pipe(
    Config.withDefault(''),
    Config.map((value) => Math.min(readEnvInt(value, fallback), maximum)),
  );
const boolean = (name: string, fallback: boolean) =>
  Config.string(name).pipe(
    Config.withDefault(''),
    Config.map((value) => readEnvBool(value, fallback)),
  );

export const OpenAISettings = Config.all({
  defaultWindowMs: integer('OPENAI_RATELIMIT_WINDOW_MS', 60_000),
  rateLimitEnabled: boolean('OPENAI_RATELIMIT_ENABLED', true),
  requestTimeoutMs: integer('OPENAI_REQUEST_TIMEOUT_MS', 180_000, 600_000),
  retryMaxAttempts: integer('OPENAI_RETRY_MAX_ATTEMPTS', 3, 10),
  retryBaseDelayMs: integer('OPENAI_RETRY_BASE_DELAY_MS', 400, 60_000),
  retryMaxDelayMs: integer('OPENAI_RETRY_MAX_DELAY_MS', 3_000, 60_000),
  dailyBudgetEnabled: boolean('OPENAI_DAILY_BUDGET_ENABLED', false),
  dailyBudgetMaxTokens: integer('OPENAI_DAILY_BUDGET_MAX_TOKENS', 0),
  streamDebugEnabled: boolean('OPENAI_STREAM_DEBUG', false),
  limits: Config.all({
    explain: integer('OPENAI_RATELIMIT_EXPLAIN_MAX', 15),
    review: integer('OPENAI_RATELIMIT_REVIEW_MAX', 6),
    'generate-table': integer('OPENAI_RATELIMIT_GENERATE_MAX', 4),
    'generate-comments': integer('OPENAI_RATELIMIT_GENERATE_COMMENTS_MAX', 6),
    'index-advisor': integer('OPENAI_RATELIMIT_INDEX_ADVISOR_MAX', 6),
  }),
}).pipe(
  Config.map(({ limits, ...config }): OpenAIConfig => ({
    ...config,
    rateLimitRules: Object.fromEntries(
      Object.entries(limits).map(([route, maxRequests]) => [
        route,
        { maxRequests, windowMs: config.defaultWindowMs },
      ]),
    ) as Record<AIRouteKey, RateLimitRule>,
  })),
);

export const openAIConfigProvider = (env: ApiEnv['Bindings']) =>
  ConfigProvider.fromEnv({
    env: Object.fromEntries(
      Object.entries(env).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
  });
export const loadOpenAIConfig = (env: ApiEnv['Bindings']) =>
  OpenAISettings.parse(openAIConfigProvider(env));
export const buildOpenAIConfig = (env: ApiEnv['Bindings']): OpenAIConfig =>
  Effect.runSync(loadOpenAIConfig(env));

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
