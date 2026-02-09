import type { Context } from 'hono';

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

type RateLimitBucket = {
  timestamps: number[];
  lastSeenAt: number;
};

const readEnvInt = (key: string, fallback: number): number => {
  const raw = process.env[key];
  const parsed = Number(raw);
  if (!raw || Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const readEnvBool = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const DEFAULT_WINDOW_MS = readEnvInt('OPENAI_RATELIMIT_WINDOW_MS', 60_000);

const RATE_LIMIT_RULES: Record<OpenAIRouteKey, RateLimitRule> = {
  // explain 成本最低，默认限制放宽
  explain: {
    maxRequests: readEnvInt('OPENAI_RATELIMIT_EXPLAIN_MAX', 15),
    windowMs: DEFAULT_WINDOW_MS,
  },
  // review 成本中等
  review: {
    maxRequests: readEnvInt('OPENAI_RATELIMIT_REVIEW_MAX', 6),
    windowMs: DEFAULT_WINDOW_MS,
  },
  // generate-table 成本最高
  'generate-table': {
    maxRequests: readEnvInt('OPENAI_RATELIMIT_GENERATE_MAX', 4),
    windowMs: DEFAULT_WINDOW_MS,
  },
};

const RATE_LIMIT_ENABLED = readEnvBool('OPENAI_RATELIMIT_ENABLED', true);
const RETRY_MAX_ATTEMPTS = readEnvInt('OPENAI_RETRY_MAX_ATTEMPTS', 3);
const RETRY_BASE_DELAY_MS = readEnvInt('OPENAI_RETRY_BASE_DELAY_MS', 400);
const RETRY_MAX_DELAY_MS = readEnvInt('OPENAI_RETRY_MAX_DELAY_MS', 3_000);

const RATE_LIMIT_BUCKETS = new Map<string, RateLimitBucket>();
const RATE_LIMIT_CLEANUP_THRESHOLD = 1_000;
const RETRYABLE_STATUS_CODES = new Set([
  408, 409, 425, 429, 500, 502, 503, 504,
]);

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const cleanupExpiredBuckets = () => {
  if (RATE_LIMIT_BUCKETS.size < RATE_LIMIT_CLEANUP_THRESHOLD) return;
  const now = Date.now();
  for (const [key, bucket] of RATE_LIMIT_BUCKETS.entries()) {
    if (now - bucket.lastSeenAt > DEFAULT_WINDOW_MS * 2) {
      RATE_LIMIT_BUCKETS.delete(key);
    }
  }
};

const getClientIp = (c: Context): string => {
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

const readHeaderFromUnknown = (
  headers: unknown,
  key: string,
): string | undefined => {
  if (!headers || typeof headers !== 'object') return undefined;
  const normalizedKey = key.toLowerCase();

  // Headers 实例
  if (
    'get' in headers &&
    typeof (headers as { get: unknown }).get === 'function'
  ) {
    const value = (headers as { get: (k: string) => string | null }).get(
      normalizedKey,
    );
    return value ?? undefined;
  }

  // 普通对象
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
      return [
        'ECONNRESET',
        'ETIMEDOUT',
        'EAI_AGAIN',
        'ENOTFOUND',
        'ECONNREFUSED',
      ].includes(code);
    }
  }

  return false;
};

const computeBackoffDelayMs = (
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
) => {
  const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  // 0.8 ~ 1.2 抖动，避免并发请求同时重试
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.max(100, Math.round(exponential * jitter));
};

export async function withOpenAIRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? RETRY_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? RETRY_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? RETRY_MAX_DELAY_MS;

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      const shouldRetry = isRetryableError(error) && attempt < maxAttempts;
      if (!shouldRetry) {
        throw error;
      }

      const retryAfterMs = getRetryAfterFromError(error);
      const backoffDelayMs = computeBackoffDelayMs(
        attempt,
        baseDelayMs,
        maxDelayMs,
      );
      const waitMs = Math.min(retryAfterMs ?? backoffDelayMs, maxDelayMs);

      const status = getErrorStatus(error);
      console.warn(
        `[${options.scope}] OpenAI request failed (attempt ${attempt}/${maxAttempts}, status=${status ?? 'unknown'}), retrying in ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
  }

  // 理论上不会触发，兜底处理
  throw new Error(`[${options.scope}] OpenAI retry failed unexpectedly`);
}

export function enforceOpenAIRateLimit(c: Context, routeKey: OpenAIRouteKey) {
  if (!RATE_LIMIT_ENABLED) return null;

  cleanupExpiredBuckets();

  const rule = RATE_LIMIT_RULES[routeKey];
  const ip = getClientIp(c);
  const now = Date.now();
  const key = `${routeKey}:${ip}`;
  const bucket = RATE_LIMIT_BUCKETS.get(key) ?? {
    timestamps: [],
    lastSeenAt: 0,
  };

  const validTimestamps = bucket.timestamps.filter(
    (timestamp) => now - timestamp < rule.windowMs,
  );
  const remaining = Math.max(rule.maxRequests - validTimestamps.length, 0);

  if (remaining === 0) {
    const oldestTimestamp = validTimestamps[0] ?? now;
    const retryAfterMs = Math.max(
      rule.windowMs - (now - oldestTimestamp),
      1_000,
    );
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1_000));

    c.header('Retry-After', String(retryAfterSeconds));
    c.header('X-RateLimit-Limit', String(rule.maxRequests));
    c.header('X-RateLimit-Remaining', '0');
    c.header('X-RateLimit-Window-Ms', String(rule.windowMs));

    return c.json(
      {
        error: '请求过于频繁，请稍后再试',
        retryAfterSeconds,
        limit: rule.maxRequests,
        windowMs: rule.windowMs,
      },
      429,
    );
  }

  validTimestamps.push(now);
  RATE_LIMIT_BUCKETS.set(key, {
    timestamps: validTimestamps,
    lastSeenAt: now,
  });

  c.header('X-RateLimit-Limit', String(rule.maxRequests));
  c.header('X-RateLimit-Remaining', String(Math.max(remaining - 1, 0)));
  c.header('X-RateLimit-Window-Ms', String(rule.windowMs));

  return null;
}
