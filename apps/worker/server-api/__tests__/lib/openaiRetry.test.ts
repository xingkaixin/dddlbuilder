import { afterEach, describe, expect, it, vi } from 'vitest';
import { APIConnectionError, APIConnectionTimeoutError, APIUserAbortError } from 'openai';
import type { ApiEnv } from '../../lib/context.js';
import { buildOpenAIConfig, withOpenAIRetry } from '../../openaiControl.js';

const config = buildOpenAIConfig({} as ApiEnv['Bindings']);

const createStatusError = (status: number, headers?: Headers) =>
  Object.assign(new Error(`HTTP ${status}`), { status, headers });

describe('withOpenAIRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the result and initial attempt count without scheduling a retry', async () => {
    const operation = vi.fn().mockResolvedValue('ok');

    await expect(
      withOpenAIRetry(operation, { scope: 'test', maxAttempts: 3 }, config),
    ).resolves.toEqual({ data: 'ok', attempts: 1, retryCount: 0 });
    expect(operation).toHaveBeenCalledOnce();
  });

  it('retries a transient HTTP failure and reports the total attempts', async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(createStatusError(503))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    const result = withOpenAIRetry(
      operation,
      {
        scope: 'completion',
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 10,
        onRetry,
      },
      config,
    );
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ data: 'ok', attempts: 2, retryCount: 1 });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith({
      error: expect.objectContaining({ status: 503 }),
      attempt: 1,
      maxAttempts: 3,
      status: 503,
      waitMs: 10,
    });
  });

  it('does not retry a non-transient HTTP failure and preserves its identity', async () => {
    const error = createStatusError(400);
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(error);
    const onRetry = vi.fn();

    await expect(
      withOpenAIRetry(operation, { scope: 'test', maxAttempts: 3, onRetry }, config),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('cancels retry backoff without starting another attempt', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const operation = vi.fn().mockRejectedValue(createStatusError(503));
    const onRetry = vi.fn();
    const result = withOpenAIRetry(
      operation,
      { scope: 'deadline', maxAttempts: 3, onRetry, signal: controller.signal },
      config,
    );
    const rejection = result.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(onRetry).toHaveBeenCalledOnce();

    controller.abort();
    expect(await rejection).toBeInstanceOf(Error);
    await vi.runAllTimersAsync();
    expect(operation).toHaveBeenCalledOnce();
  });

  it('waits for an active attempt to finish before reporting cancellation', async () => {
    const controller = new AbortController();
    let finishAttempt!: () => void;
    const attempt = new Promise<void>((resolve) => {
      finishAttempt = resolve;
    });
    let finished = false;
    const operation = vi.fn(async () => {
      await attempt;
      finished = true;
      controller.signal.throwIfAborted();
    });
    const result = withOpenAIRetry(
      operation,
      { scope: 'in-flight', signal: controller.signal },
      config,
    );
    let cancellationReturned = false;
    const rejection = result.catch((error: unknown) => {
      cancellationReturned = true;
      return error;
    });
    expect(operation).toHaveBeenCalledOnce();

    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancellationReturned).toBe(false);
    expect(finished).toBe(false);
    finishAttempt();

    expect(await rejection).toBeInstanceOf(Error);
    expect(finished).toBe(true);
    expect(operation).toHaveBeenCalledOnce();
  });

  it('preserves the final error after exhausting the retry budget', async () => {
    vi.useFakeTimers();
    const firstError = createStatusError(503);
    const secondError = createStatusError(503);
    const finalError = createStatusError(503);
    const operation = vi
      .fn<() => Promise<never>>()
      .mockRejectedValueOnce(firstError)
      .mockRejectedValueOnce(secondError)
      .mockRejectedValue(finalError);
    const onRetry = vi.fn();

    const result = withOpenAIRetry(
      operation,
      {
        scope: 'test',
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1_000,
        onRetry,
      },
      config,
    );
    const rejection = result.catch((error: unknown) => error);
    await vi.runAllTimersAsync();

    await expect(rejection).resolves.toBe(finalError);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    const events = onRetry.mock.calls.map(([event]) => event);
    const waits = events.map(({ waitMs }) => waitMs);
    expect(events[0]).toMatchObject({ error: firstError, attempt: 1, maxAttempts: 3, status: 503 });
    expect(events[1]).toMatchObject({
      error: secondError,
      attempt: 2,
      maxAttempts: 3,
      status: 503,
    });
    expect(waits[0]).toBeGreaterThanOrEqual(100);
    expect(waits[0]).toBeLessThanOrEqual(120);
    expect(waits[1]).toBeGreaterThanOrEqual(160);
    expect(waits[1]).toBeLessThanOrEqual(240);
  });

  it('retries known network failures without an HTTP status', async () => {
    vi.useFakeTimers();
    const networkError = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    const result = withOpenAIRetry(
      operation,
      { scope: 'stream', maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1, onRetry },
      config,
    );
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ data: 'ok', attempts: 2, retryCount: 1 });
    expect(onRetry).toHaveBeenCalledWith({
      error: networkError,
      attempt: 1,
      maxAttempts: 2,
      status: null,
      waitMs: 1,
    });
  });

  it.each([
    ['APIConnectionError', new APIConnectionError({ cause: new Error('socket closed') })],
    ['APIConnectionTimeoutError', new APIConnectionTimeoutError({ message: 'connect timed out' })],
  ])('retries OpenAI SDK %s without relying on instanceof', async (_label, connectionError) => {
    vi.useFakeTimers();
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValue('ok');

    const result = withOpenAIRetry(
      operation,
      { scope: 'sdk-connection', maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
      config,
    );
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ data: 'ok', attempts: 2, retryCount: 1 });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('retries a known network code nested in an error cause', async () => {
    vi.useFakeTimers();
    const nestedError = new Error('fetch failed', {
      cause: Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }),
    });
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(nestedError)
      .mockResolvedValue('ok');

    const result = withOpenAIRetry(
      operation,
      { scope: 'nested-network', maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
      config,
    );
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ data: 'ok', attempts: 2, retryCount: 1 });
  });

  it('does not retry an OpenAI user abort', async () => {
    const abortError = new APIUserAbortError();
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(abortError);

    await expect(
      withOpenAIRetry(operation, { scope: 'user-abort', maxAttempts: 3 }, config),
    ).rejects.toBe(abortError);
    expect(operation).toHaveBeenCalledOnce();
  });

  it('honors Retry-After while capping it to the configured maximum delay', async () => {
    vi.useFakeTimers();
    const error = createStatusError(429, new Headers({ 'Retry-After': '5' }));
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    const result = withOpenAIRetry(
      operation,
      { scope: 'test', maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 250, onRetry },
      config,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(operation).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith({
      error,
      attempt: 1,
      maxAttempts: 2,
      status: 429,
      waitMs: 250,
    });

    await vi.advanceTimersByTimeAsync(249);
    expect(operation).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({ data: 'ok', attempts: 2, retryCount: 1 });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('uses the schedule clock for an HTTP-date Retry-After value', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T12:00:00.000Z'));
    const retryAt = new Date('2026-08-29T12:00:05.000Z').toUTCString();
    const error = createStatusError(503, new Headers({ 'Retry-After': retryAt }));
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    const result = withOpenAIRetry(
      operation,
      { scope: 'test', maxAttempts: 2, baseDelayMs: 100, maxDelayMs: 6_000, onRetry },
      config,
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(onRetry).toHaveBeenCalledWith({
      error,
      attempt: 1,
      maxAttempts: 2,
      status: 503,
      waitMs: 5_000,
    });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ data: 'ok', attempts: 2, retryCount: 1 });
  });

  it('retries a transient error thrown synchronously by the operation', async () => {
    vi.useFakeTimers();
    const error = createStatusError(503);
    const operation = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => {
        throw error;
      })
      .mockResolvedValue('ok');

    const result = withOpenAIRetry(
      operation,
      { scope: 'test', maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
      config,
    );
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ data: 'ok', attempts: 2, retryCount: 1 });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not schedule a retry when only one attempt is allowed', async () => {
    const error = createStatusError(503);
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(error);
    const onRetry = vi.fn();

    await expect(
      withOpenAIRetry(operation, { scope: 'test', maxAttempts: 1, onRetry }, config),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });
});
