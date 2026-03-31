import type { Context } from 'hono';
import type { ApiEnv } from './lib/context.js';
import { errorResponse, type ApiErrorCode } from './lib/http.js';

export type OpenAIRouteKey = 'explain' | 'review' | 'generate-table';

type RateLimitRule = {
  maxRequests: number;
  windowMs: number;
};

type RetryOptions = {
  scope: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

type CounterBucket = {
  count: number;
  expiresAt: number;
};

type AuditLogPayload = {
  requestId: string;
  route: OpenAIRouteKey;
  status: number;
  latencyMs: number;
  retryCount: number;
  rateLimitHit: boolean;
  estimatedTokens: number;
  model?: string;
  maxOutputTokens?: number;
  rateLimitEnabled: boolean;
  rateLimitStore: 'memory' | 'kv';
  rateLimitLimit: number | null;
  rateLimitRemaining: number | null;
  rateLimitWindowMs: number | null;
  budgetHit?: boolean;
  budgetEnabled: boolean;
  budgetLimitTokens: number | null;
  budgetUsedTokens: number | null;
  errorCode?: ApiErrorCode;
};

export type OpenAIRetryResult<T> = {
  data: T;
  attempts: number;
};

// Environment variable helpers
const readEnvInt = (value: string | undefined, fallback: number): number => {
  const raw = value;
  const parsed = Number(raw);
  if (!raw || Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const readEnvBool = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

// Build config from environment bindings
export type OpenAIConfig = {
  defaultWindowMs: number;
  rateLimitEnabled: boolean;
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  dailyBudgetEnabled: boolean;
  dailyBudgetMaxTokens: number;
  streamDebugEnabled: boolean;
  counterStoreMode: 'memory' | 'kv';
  rateLimitRules: Record<OpenAIRouteKey, RateLimitRule>;
};

export const buildOpenAIConfig = (env: ApiEnv['Bindings']): OpenAIConfig => {
  const defaultWindowMs = readEnvInt(env.OPENAI_RATELIMIT_WINDOW_MS, 60_000);
  const rateLimitEnabled = readEnvBool(env.OPENAI_RATELIMIT_ENABLED, true);
  const retryMaxAttempts = readEnvInt(env.OPENAI_RETRY_MAX_ATTEMPTS, 3);
  const retryBaseDelayMs = readEnvInt(env.OPENAI_RETRY_BASE_DELAY_MS, 400);
  const retryMaxDelayMs = readEnvInt(env.OPENAI_RETRY_MAX_DELAY_MS, 3_000);
  const dailyBudgetEnabled = readEnvBool(env.OPENAI_DAILY_BUDGET_ENABLED, false);
  const dailyBudgetMaxTokens = readEnvInt(env.OPENAI_DAILY_BUDGET_MAX_TOKENS, 0);
  const streamDebugEnabled = readEnvBool(env.OPENAI_STREAM_DEBUG, false);
  const counterStoreMode =
    env.OPENAI_RATELIMIT_STORE?.trim().toLowerCase() === 'memory' ? 'memory' : 'kv';

  return {
    defaultWindowMs,
    rateLimitEnabled,
    retryMaxAttempts,
    retryBaseDelayMs,
    retryMaxDelayMs,
    dailyBudgetEnabled,
    dailyBudgetMaxTokens,
    streamDebugEnabled,
    counterStoreMode,
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
    },
  };
};

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export type GovernanceSnapshot = {
  rateLimitEnabled: boolean;
  rateLimitStore: 'memory' | 'kv';
  rateLimitLimit: number | null;
  rateLimitWindowMs: number | null;
  budgetEnabled: boolean;
  budgetLimitTokens: number | null;
};

const MEMORY_COUNTERS = new Map<string, CounterBucket>();
let hasWarnedKVUnavailable = false;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const hashFNV1a = (input: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const parseRetryAfterMs = (retryAfterHeader: string | null | undefined) => {
  if (!retryAfterHeader) return null;
  const numeric = Number(retryAfterHeader);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return Math.round(numeric * 1_000);
  }

  const dateMs = Date.parse(retryAfterHeader);
  if (Number.isNaN(dateMs)) return null;

  const delta = dateMs - Date.now();
  return delta > 0 ? delta : null;
};

const readHeaderFromUnknown = (headers: unknown, key: string): string | undefined => {
  if (!headers || typeof headers !== 'object') return undefined;
  const normalizedKey = key.toLowerCase();

  if ('get' in headers && typeof (headers as { get: unknown }).get === 'function') {
    const value = (headers as { get: (k: string) => string | null }).get(normalizedKey);
    return value ?? undefined;
  }

  const entries = Object.entries(headers as Record<string, unknown>);
  for (const [name, value] of entries) {
    if (name.toLowerCase() === normalizedKey && typeof value === 'string') {
      return value;
    }
  }

  return undefined;
};

const getErrorStatus = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
};

const getRetryAfterFromError = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const headers = (error as { headers?: unknown }).headers;
  const retryAfterHeader = readHeaderFromUnknown(headers, 'retry-after');
  return parseRetryAfterMs(retryAfterHeader);
};

const isRetryableError = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  if (status !== null) {
    return RETRYABLE_STATUS_CODES.has(status);
  }

  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      return ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED'].includes(code);
    }
  }

  return false;
};

const computeBackoffDelayMs = (attempt: number, baseDelayMs: number, maxDelayMs: number) => {
  const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.max(100, Math.round(exponential * jitter));
};

const getClientIp = (c: Context<ApiEnv>): string => {
  const cfConnectingIp = c.req.header('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;

  const xForwardedFor = c.req.header('x-forwarded-for');
  if (xForwardedFor) {
    const [first] = xForwardedFor.split(',');
    if (first?.trim()) return first.trim();
  }

  const xRealIp = c.req.header('x-real-ip');
  if (xRealIp) return xRealIp;

  return 'unknown';
};

const getClientFingerprint = (c: Context<ApiEnv>, routeKey: OpenAIRouteKey): string => {
  const ip = getClientIp(c);
  const ua = c.req.header('user-agent')?.slice(0, 256) ?? 'unknown';
  return hashFNV1a(`${routeKey}|${ip}|${ua}`);
};

const toUtf8Bytes = (input: string) => new TextEncoder().encode(input).length;

const estimateValueChars = (value: unknown): number => {
  if (value == null) return 0;
  if (typeof value === 'string') return value.length;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value).length;
  }
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
};

export const estimateRequestTokens = (payload: unknown, maxOutputTokens = 0): number => {
  const estimatedInputChars = estimateValueChars(payload);
  const estimatedInputTokens = Math.max(1, Math.ceil(estimatedInputChars / 4));
  const outputTokens = Math.max(0, Math.floor(maxOutputTokens));
  return estimatedInputTokens + outputTokens;
};

export const getOpenAIGovernanceSnapshot = (
  routeKey: OpenAIRouteKey,
  config: OpenAIConfig,
): GovernanceSnapshot => {
  const rule = config.rateLimitRules[routeKey];
  return {
    rateLimitEnabled: config.rateLimitEnabled,
    rateLimitStore: config.counterStoreMode,
    rateLimitLimit: config.rateLimitEnabled ? rule.maxRequests : null,
    rateLimitWindowMs: config.rateLimitEnabled ? rule.windowMs : null,
    budgetEnabled: config.dailyBudgetEnabled,
    budgetLimitTokens:
      config.dailyBudgetEnabled && config.dailyBudgetMaxTokens > 0
        ? config.dailyBudgetMaxTokens
        : null,
  };
};

// KV-based counter implementation using CF KV
const runKVIncrCounter = async (
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  amount: number,
): Promise<number> => {
  const currentValue = await kv.get(key);
  const currentCount = currentValue ? parseInt(currentValue, 10) : 0;
  if (Number.isNaN(currentCount)) {
    throw new Error('KV_COUNTER_INVALID');
  }

  const newCount = currentCount + Math.max(1, amount);
  await kv.put(key, String(newCount), { expirationTtl: ttlSeconds });
  return newCount;
};

const incrMemoryCounter = (key: string, ttlMs: number, amount: number) => {
  const now = Date.now();
  const existing = MEMORY_COUNTERS.get(key);
  if (!existing || existing.expiresAt <= now) {
    const next: CounterBucket = {
      count: Math.max(1, amount),
      expiresAt: now + ttlMs,
    };
    MEMORY_COUNTERS.set(key, next);
    return next.count;
  }

  existing.count += Math.max(1, amount);
  existing.expiresAt = now + ttlMs;
  MEMORY_COUNTERS.set(key, existing);
  return existing.count;
};

const incrCounter = async (
  kv: KVNamespace | undefined,
  key: string,
  ttlMs: number,
  amount: number,
  storeMode: 'memory' | 'kv',
): Promise<number> => {
  if (storeMode === 'memory' || !kv) {
    return incrMemoryCounter(key, ttlMs, amount);
  }

  try {
    return await runKVIncrCounter(kv, key, Math.ceil(ttlMs / 1000), amount);
  } catch {
    if (!hasWarnedKVUnavailable) {
      hasWarnedKVUnavailable = true;
      console.warn(
        '[OpenAIControl] KV unavailable, rate limiting and budget control fell back to memory',
      );
    }
    return incrMemoryCounter(key, ttlMs, amount);
  }
};

const getCurrentUtcDateKey = () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

const getMsUntilUtcTomorrow = () => {
  const now = new Date();
  const tomorrow = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(60_000, tomorrow - now.getTime());
};

export async function enforceOpenAIRateLimit(
  c: Context<ApiEnv>,
  routeKey: OpenAIRouteKey,
  config: OpenAIConfig,
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
  const clientFingerprint = getClientFingerprint(c, routeKey);
  const counterKey = `openai:rl:${routeKey}:${clientFingerprint}:${windowBucket}`;
  const ttlMs = rule.windowMs + 5_000;

  const kv = c.env?.RATE_LIMIT_KV;
  const count = await incrCounter(kv, counterKey, ttlMs, 1, config.counterStoreMode);
  const remaining = Math.max(rule.maxRequests - count, 0);

  c.header('X-RateLimit-Limit', String(rule.maxRequests));
  c.header('X-RateLimit-Remaining', String(remaining));
  c.header('X-RateLimit-Window-Ms', String(rule.windowMs));

  if (count <= rule.maxRequests) {
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

  const safeEstimatedTokens = Math.max(1, Math.floor(estimatedTokens));
  const dayKey = getCurrentUtcDateKey();
  const counterKey = `openai:budget:tokens:${dayKey}`;
  const ttlMs = getMsUntilUtcTomorrow() + 60 * 60 * 1000;

  const kv = c.env?.RATE_LIMIT_KV;
  const usedTokens = await incrCounter(
    kv,
    counterKey,
    ttlMs,
    safeEstimatedTokens,
    config.counterStoreMode,
  );

  c.header('X-Budget-Limit-Tokens', String(config.dailyBudgetMaxTokens));
  c.header('X-Budget-Used-Tokens', String(usedTokens));

  if (usedTokens <= config.dailyBudgetMaxTokens) {
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
    usedTokens,
  };
}

export function logOpenAIAudit(payload: AuditLogPayload) {
  console.info(
    JSON.stringify({
      event: 'openai_audit',
      ts: new Date().toISOString(),
      ...payload,
    }),
  );
}

export async function withOpenAIRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
  config: OpenAIConfig,
): Promise<OpenAIRetryResult<T>> {
  const maxAttempts = options.maxAttempts ?? config.retryMaxAttempts;
  const baseDelayMs = options.baseDelayMs ?? config.retryBaseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? config.retryMaxDelayMs;

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const data = await operation();
      return {
        data,
        attempts: attempt,
      };
    } catch (error) {
      const shouldRetry = isRetryableError(error) && attempt < maxAttempts;
      if (!shouldRetry) {
        throw error;
      }

      const retryAfterMs = getRetryAfterFromError(error);
      const backoffDelayMs = computeBackoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      const waitMs = Math.min(retryAfterMs ?? backoffDelayMs, maxDelayMs);

      const status = getErrorStatus(error);
      console.warn(
        `[${options.scope}] OpenAI request failed (attempt ${attempt}/${maxAttempts}, status=${status ?? 'unknown'}), retrying in ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
  }

  throw new Error(`[${options.scope}] OpenAI retry failed unexpectedly`);
}

export const estimateResponseTokensFromText = (text: string) => {
  const safeText = typeof text === 'string' ? text : '';
  const bytes = toUtf8Bytes(safeText);
  return Math.max(1, Math.ceil(bytes / 4));
};
