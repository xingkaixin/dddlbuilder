import { describe, expect, it, vi } from 'vitest';
import { createOpenAIStreamDebugLogger } from '../lib/aiStreamDebug.js';

describe('createOpenAIStreamDebugLogger', () => {
  it('关闭时不应输出日志', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = createOpenAIStreamDebugLogger({
      enabled: false,
      requestId: 'req-1',
      route: 'explain',
      model: 'gpt-test',
      startedAt: Date.now(),
      input: { sqlLength: 8 },
    });

    logger.start();
    logger.connected();
    logger.chunk('hello');
    logger.complete();

    expect(consoleInfoSpy).not.toHaveBeenCalled();
  });

  it('启用时应输出结构化事件并截断预览', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = createOpenAIStreamDebugLogger({
      enabled: true,
      requestId: 'req-2',
      route: 'review',
      model: 'gpt-test',
      startedAt: Date.now(),
      input: { ddlLength: 64 },
    });

    logger.start();
    logger.connected();
    logger.chunk(`first ${'x'.repeat(120)}`);
    logger.complete();

    const payloads = consoleInfoSpy.mock.calls.map(([value]) => JSON.parse(String(value))) as Array<
      Record<string, unknown>
    >;

    expect(payloads.map((payload) => payload.event)).toEqual([
      'ai_stream_start',
      'ai_stream_openai_connected',
      'ai_stream_first_chunk',
      'ai_stream_complete',
    ]);
    expect(payloads[2]?.preview).toBe(`first ${'x'.repeat(74)}`);
  });

  it('连接后出错时应标记为 during_stream', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = createOpenAIStreamDebugLogger({
      enabled: true,
      requestId: 'req-3',
      route: 'generate-table',
      model: 'gpt-test',
      startedAt: Date.now(),
      input: { descriptionLength: 32 },
    });

    logger.start();
    logger.connected();
    logger.error(new Error('boom'));

    const lastPayload = JSON.parse(String(consoleInfoSpy.mock.calls.at(-1)?.[0])) as Record<
      string,
      unknown
    >;

    expect(lastPayload).toMatchObject({
      event: 'ai_stream_error',
      stage: 'during_stream',
      errorMessage: 'boom',
    });
  });
});
