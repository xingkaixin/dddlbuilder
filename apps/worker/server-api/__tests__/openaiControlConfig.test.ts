import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../lib/context.js';
import {
  OpenAISettings,
  buildOpenAIConfig,
  getAIExecutionTimeoutMs,
  getAIUsageReclaimTtlMs,
} from '../lib/openaiConfig.js';

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] =>
  overrides as ApiEnv['Bindings'];

describe('OpenAI execution config', () => {
  it('loads isolated providers while preserving legacy numeric and boolean defaults', () => {
    const first = Effect.runSync(
      OpenAISettings.parse(
        ConfigProvider.fromUnknown({
          OPENAI_RETRY_MAX_ATTEMPTS: '2.9',
          OPENAI_RATELIMIT_ENABLED: 'YES',
        }),
      ),
    );
    const second = buildOpenAIConfig(
      createEnv({
        OPENAI_RETRY_MAX_ATTEMPTS: 'invalid',
        OPENAI_RATELIMIT_ENABLED: 'unknown',
      }),
    );
    expect(first.retryMaxAttempts).toBe(2);
    expect(first.rateLimitEnabled).toBe(true);
    expect(second.retryMaxAttempts).toBe(3);
    expect(second.rateLimitEnabled).toBe(false);
  });

  it('keeps the default reclaim window beyond the maximum execution time', () => {
    const config = buildOpenAIConfig(createEnv());

    expect(config.requestTimeoutMs).toBe(180_000);
    expect(getAIExecutionTimeoutMs(config)).toBe(546_000);
    expect(getAIUsageReclaimTtlMs(config)).toBe(15 * 60 * 1000);
  });

  it('extends the reclaim window when request execution settings grow', () => {
    const config = buildOpenAIConfig(
      createEnv({
        OPENAI_REQUEST_TIMEOUT_MS: '600000',
        OPENAI_RETRY_MAX_ATTEMPTS: '3',
        OPENAI_RETRY_MAX_DELAY_MS: '3000',
      }),
    );

    expect(getAIExecutionTimeoutMs(config)).toBe(1_806_000);
    expect(getAIUsageReclaimTtlMs(config)).toBe(2_106_000);
  });

  it('caps execution settings to bounded values', () => {
    const config = buildOpenAIConfig(
      createEnv({
        OPENAI_REQUEST_TIMEOUT_MS: '999999999',
        OPENAI_RETRY_MAX_ATTEMPTS: '999999999',
        OPENAI_RETRY_BASE_DELAY_MS: '999999999',
        OPENAI_RETRY_MAX_DELAY_MS: '999999999',
      }),
    );

    expect(config).toMatchObject({
      requestTimeoutMs: 600_000,
      retryMaxAttempts: 10,
      retryBaseDelayMs: 60_000,
      retryMaxDelayMs: 60_000,
    });
  });
});
