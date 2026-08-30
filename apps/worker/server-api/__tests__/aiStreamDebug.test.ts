import { describe, expect, it, vi } from 'vitest';
import { createOpenAIStreamDebugLogger } from '../lib/aiStreamDebug.js';
import type { WorkerRequestLogger } from '../lib/context.js';

const createRequestLogger = () => {
  const set = vi.fn();
  return {
    log: { set } as unknown as WorkerRequestLogger,
    set,
  };
};

const readStreamDebugPayloads = (set: ReturnType<typeof vi.fn>) =>
  set.mock.calls.map(
    ([fields]) => (fields as { ai: { streamDebug: Record<string, unknown> } }).ai.streamDebug,
  );

describe('createOpenAIStreamDebugLogger', () => {
  it('关闭时不应输出日志', () => {
    const { log, set } = createRequestLogger();
    const logger = createOpenAIStreamDebugLogger({
      enabled: false,
      requestId: 'req-1',
      route: 'explain',
      model: 'gpt-test',
      startedAt: Date.now(),
      input: { sqlLength: 8 },
      log,
    });

    logger.start();
    logger.connected();
    logger.chunk('hello');
    logger.complete();

    expect(set).not.toHaveBeenCalled();
  });

  it('启用时应输出结构化事件但不记录模型内容', () => {
    const { log, set } = createRequestLogger();
    const logger = createOpenAIStreamDebugLogger({
      enabled: true,
      requestId: 'req-2',
      route: 'review',
      model: 'gpt-test',
      startedAt: Date.now(),
      input: { ddlLength: 64 },
      log,
    });

    logger.start();
    logger.connected();
    logger.chunk(`first ${'x'.repeat(120)}`);
    logger.complete();

    const payloads = readStreamDebugPayloads(set);

    expect(payloads.map((payload) => payload.phase)).toEqual([
      'started',
      'connected',
      'streaming',
      'completed',
    ]);
    expect(payloads[0]).toMatchObject({
      requestId: 'req-2',
      route: 'review',
      model: 'gpt-test',
      debugInput: { ddlLength: 64 },
    });
    expect(payloads[2]).toMatchObject({
      chunkIndex: 1,
      chunkSize: 126,
      totalChars: 126,
    });
    expect(payloads[2]).not.toHaveProperty('preview');
    expect(payloads[2]).not.toHaveProperty('content');
  });

  it('连接后出错时应标记为 during_stream', () => {
    const { log, set } = createRequestLogger();
    const logger = createOpenAIStreamDebugLogger({
      enabled: true,
      requestId: 'req-3',
      route: 'generate-table',
      model: 'gpt-test',
      startedAt: Date.now(),
      input: { descriptionLength: 32 },
      log,
    });

    logger.start();
    logger.connected();
    logger.error(new Error('boom'));

    const lastPayload = readStreamDebugPayloads(set).at(-1);

    expect(lastPayload).toMatchObject({
      phase: 'failed',
      stage: 'during_stream',
      errorMessage: 'boom',
    });
  });
});
