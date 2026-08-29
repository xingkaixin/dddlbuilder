import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import { buildOpenAIConfig, withOpenAIRetry } from '../../openaiControl.js';

const config = buildOpenAIConfig({} as ApiEnv['Bindings']);

const createStatusError = (status: number, headers?: Headers) =>
  Object.assign(new Error(`HTTP ${status}`), { status, headers });

describe('withOpenAIRetry', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the result and initial attempt count without scheduling a retry', async () => {
    const operation = vi.fn().mockResolvedValue('ok');

    await expect(
      withOpenAIRetry(operation, { scope: 'test', maxAttempts: 3 }, config),
    ).resolves.toEqual({ data: 'ok', attempts: 1 });
    expect(operation).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('retries a transient HTTP failure and reports the total attempts', async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(createStatusError(503))
      .mockResolvedValue('ok');

    const result = withOpenAIRetry(
      operation,
      { scope: 'completion', maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 10 },
      config,
    );
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ data: 'ok', attempts: 2 });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      '[completion] OpenAI request failed (attempt 1/3, status=503), retrying in 10ms',
    );
  });

  it('does not retry a non-transient HTTP failure and preserves its identity', async () => {
    const error = createStatusError(400);
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(error);

    await expect(
      withOpenAIRetry(operation, { scope: 'test', maxAttempts: 3 }, config),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
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

    const result = withOpenAIRetry(
      operation,
      { scope: 'test', maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1_000 },
      config,
    );
    const rejection = result.catch((error: unknown) => error);
    await vi.runAllTimersAsync();

    await expect(rejection).resolves.toBe(finalError);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    const warnings = warnSpy.mock.calls.map(([message]) => String(message));
    const waits = warnings.map((message) => Number(/retrying in (\d+)ms$/.exec(message)?.[1]));
    expect(warnings[0]).toContain('(attempt 1/3, status=503)');
    expect(warnings[1]).toContain('(attempt 2/3, status=503)');
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

    const result = withOpenAIRetry(
      operation,
      { scope: 'stream', maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
      config,
    );
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ data: 'ok', attempts: 2 });
    expect(warnSpy).toHaveBeenCalledWith(
      '[stream] OpenAI request failed (attempt 1/2, status=unknown), retrying in 1ms',
    );
  });

  it('honors Retry-After while capping it to the configured maximum delay', async () => {
    vi.useFakeTimers();
    const error = createStatusError(429, new Headers({ 'Retry-After': '5' }));
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok');

    const result = withOpenAIRetry(
      operation,
      { scope: 'test', maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 250 },
      config,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(operation).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      '[test] OpenAI request failed (attempt 1/2, status=429), retrying in 250ms',
    );

    await vi.advanceTimersByTimeAsync(249);
    expect(operation).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({ data: 'ok', attempts: 2 });
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

    const result = withOpenAIRetry(
      operation,
      { scope: 'test', maxAttempts: 2, baseDelayMs: 100, maxDelayMs: 6_000 },
      config,
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(warnSpy).toHaveBeenCalledWith(
      '[test] OpenAI request failed (attempt 1/2, status=503), retrying in 5000ms',
    );
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ data: 'ok', attempts: 2 });
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

    await expect(result).resolves.toEqual({ data: 'ok', attempts: 2 });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not schedule a retry when only one attempt is allowed', async () => {
    const error = createStatusError(503);
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(error);

    await expect(
      withOpenAIRetry(operation, { scope: 'test', maxAttempts: 1 }, config),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
