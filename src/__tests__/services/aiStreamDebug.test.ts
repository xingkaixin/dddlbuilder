import { afterEach, describe, expect, it, vi } from 'vitest';

describe('aiStreamDebug', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('默认应关闭 AI 流调试', async () => {
    const { isAiStreamDebugActive } = await import('@/services/aiStreamDebug');

    expect(isAiStreamDebugActive()).toBe(false);
  });

  it('设置 localStorage 覆盖时应启用 AI 流调试', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockReturnValue('true');
    vi.resetModules();

    const { isAiStreamDebugActive } = await import('@/services/aiStreamDebug');

    expect(isAiStreamDebugActive()).toBe(true);
  });

  it('启用后应输出带前缀的 debug 日志', async () => {
    vi.stubEnv('VITE_ENABLE_AI_STREAM_DEBUG', 'true');
    vi.resetModules();
    const consoleInfoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => {});

    const { logAiStreamDebug } = await import('@/services/aiStreamDebug');

    logAiStreamDebug('ai_stream_test', { route: 'explain' });

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[AIStreamDebug] ai_stream_test',
      { route: 'explain' },
    );
  });
});
