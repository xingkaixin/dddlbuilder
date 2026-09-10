import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';
import { AIProviderError, AIUsageError } from './aiErrors.js';
import type { OpenAIConfig } from './openaiConfig.js';

type RetryOptions = {
  scope: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (event: OpenAIRetryEvent) => void;
};

export type OpenAIRetryResult<T> = {
  data: T;
  attempts: number;
  retryCount: number;
};

export type OpenAIRetryEvent = {
  error: unknown;
  attempt: number;
  maxAttempts: number;
  status: number | null;
  waitMs: number;
};

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNREFUSED',
]);
const RETRYABLE_CONNECTION_ERROR_NAMES = new Set([
  'APIConnectionError',
  'APIConnectionTimeoutError',
]);
const ABORT_ERROR_NAMES = new Set(['AbortError', 'APIUserAbortError']);
const ERROR_CAUSE_DEPTH_LIMIT = 8;

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
  if (error instanceof AIProviderError) return getErrorStatus(error.cause);
  if (!error || typeof error !== 'object') return null;
  const status = (error as { status?: unknown }).status;

  return typeof status === 'number' ? status : null;
};

const getRetryAfterFromError = (error: unknown, now: number): number | null => {
  if (error instanceof AIProviderError) return getRetryAfterFromError(error.cause, now);
  if (!error || typeof error !== 'object') return null;
  const headers = (error as { headers?: unknown }).headers;

  return parseRetryAfterMs(readHeaderFromUnknown(headers, 'retry-after'), now);
};

const readErrorName = (error: object) => {
  const name = Reflect.get(error, 'name');

  if (typeof name === 'string' && name !== 'Error') return name;
  const constructor = Reflect.get(error, 'constructor');

  if (!constructor || typeof constructor !== 'function') return null;

  return typeof constructor.name === 'string' ? constructor.name : null;
};

const getErrorChain = (error: unknown) => {
  const chain: object[] = [];
  const seen = new Set<object>();
  let current = error;

  while (
    current !== null &&
    typeof current === 'object' &&
    chain.length < ERROR_CAUSE_DEPTH_LIMIT &&
    !seen.has(current)
  ) {
    chain.push(current);
    seen.add(current);
    current = Reflect.get(current, 'cause');
  }

  return chain;
};

const isRetryableError = (error: unknown): boolean => {
  if (error instanceof AIUsageError) return false;
  const status = getErrorStatus(error);

  if (status !== null) {
    return RETRYABLE_STATUS_CODES.has(status);
  }

  const chain = getErrorChain(error);

  if (chain.some((item) => ABORT_ERROR_NAMES.has(readErrorName(item) ?? ''))) return false;

  return chain.some((item) => {
    if (RETRYABLE_CONNECTION_ERROR_NAMES.has(readErrorName(item) ?? '')) return true;
    const code = Reflect.get(item, 'code');

    return typeof code === 'string' && RETRYABLE_NETWORK_CODES.has(code.toUpperCase());
  });
};

const createRetrySchedule = (options: {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onRetry?: (event: OpenAIRetryEvent) => void;
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
        options.onRetry?.({
          error: input,
          attempt,
          maxAttempts: options.maxAttempts,
          status,
          waitMs,
        });
      }),
    ),
  );

export const retryOpenAI = <A, E, R>(
  operation: Effect.Effect<A, E, R>,
  options: RetryOptions,
  config: OpenAIConfig,
): Effect.Effect<OpenAIRetryResult<A>, E, R> =>
  Effect.suspend(() => {
    const maxAttempts = options.maxAttempts ?? config.retryMaxAttempts;
    const baseDelayMs = options.baseDelayMs ?? config.retryBaseDelayMs;
    const maxDelayMs = options.maxDelayMs ?? config.retryMaxDelayMs;

    if (maxAttempts < 1) {
      return Effect.die(new Error(`[${options.scope}] OpenAI retry failed unexpectedly`));
    }

    let attempts = 0;

    const attempt = Effect.suspend(() => {
      attempts += 1;

      return operation;
    });

    return attempt.pipe(
      Effect.retry(
        createRetrySchedule({ maxAttempts, baseDelayMs, maxDelayMs, onRetry: options.onRetry }),
      ),
      Effect.map((data) => ({ data, attempts, retryCount: Math.max(0, attempts - 1) })),
    );
  });
