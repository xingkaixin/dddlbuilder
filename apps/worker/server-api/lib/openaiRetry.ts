import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';
import type { OpenAIConfig } from './openaiConfig.js';

type RetryOptions = {
  scope: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export type OpenAIRetryResult<T> = {
  data: T;
  attempts: number;
};

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNREFUSED',
]);

const parseRetryAfterMs = (
  retryAfterHeader: string | null | undefined,
  now: number,
): number | null => {
  if (!retryAfterHeader) return null;
  const numeric = Number(retryAfterHeader);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return Math.round(numeric * 1_000);
  }

  const dateMs = Date.parse(retryAfterHeader);
  if (Number.isNaN(dateMs)) return null;

  const delta = dateMs - now;
  return delta > 0 ? delta : null;
};

const readHeaderFromUnknown = (headers: unknown, key: string): string | undefined => {
  if (!headers || typeof headers !== 'object') return undefined;
  const normalizedKey = key.toLowerCase();

  if ('get' in headers && typeof (headers as { get: unknown }).get === 'function') {
    const value = (headers as { get: (header: string) => string | null }).get(normalizedKey);
    return value ?? undefined;
  }

  for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
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

const getRetryAfterFromError = (error: unknown, now: number): number | null => {
  if (!error || typeof error !== 'object') return null;
  const headers = (error as { headers?: unknown }).headers;
  return parseRetryAfterMs(readHeaderFromUnknown(headers, 'retry-after'), now);
};

const isRetryableError = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  if (status !== null) {
    return RETRYABLE_STATUS_CODES.has(status);
  }

  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && RETRYABLE_NETWORK_CODES.has(code);
};

const createRetrySchedule = (options: {
  scope: string;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}) =>
  Schedule.exponential(Duration.millis(options.baseDelayMs)).pipe(
    Schedule.setInputType<unknown>(),
    Schedule.while(({ input }) => isRetryableError(input)),
    Schedule.upTo({ times: Math.max(0, options.maxAttempts - 1) }),
    Schedule.modifyDelay(({ duration }) =>
      Effect.succeed(Duration.min(duration, Duration.millis(options.maxDelayMs))),
    ),
    Schedule.jittered,
    Schedule.modifyDelay(({ input, duration, now }) => {
      const retryAfterMs = getRetryAfterFromError(input, now);
      const backoffMs = Math.max(100, Math.round(Duration.toMillis(duration)));
      return Effect.succeed(
        Duration.millis(Math.min(retryAfterMs ?? backoffMs, options.maxDelayMs)),
      );
    }),
    Schedule.tap(({ input, attempt, duration }) =>
      Effect.sync(() => {
        const status = getErrorStatus(input);
        const waitMs = Duration.toMillis(duration);
        console.warn(
          `[${options.scope}] OpenAI request failed (attempt ${attempt}/${options.maxAttempts}, status=${status ?? 'unknown'}), retrying in ${waitMs}ms`,
        );
      }),
    ),
  );

export async function withOpenAIRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
  config: OpenAIConfig,
): Promise<OpenAIRetryResult<T>> {
  const maxAttempts = options.maxAttempts ?? config.retryMaxAttempts;
  const baseDelayMs = options.baseDelayMs ?? config.retryBaseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? config.retryMaxDelayMs;

  if (maxAttempts < 1) {
    throw new Error(`[${options.scope}] OpenAI retry failed unexpectedly`);
  }

  let attempts = 0;
  const operationEffect = Effect.tryPromise({
    try: () => {
      attempts += 1;
      return operation();
    },
    catch: (error) => error,
  });
  const schedule = createRetrySchedule({
    scope: options.scope,
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
  });

  return Effect.runPromise(
    operationEffect.pipe(
      Effect.retry(schedule),
      Effect.map((data) => ({ data, attempts })),
    ),
  );
}
