import { afterEach, describe, expect, it, vi } from 'vitest';

describe('featureFlags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('未设置烟花开关时应默认关闭', async () => {
    vi.unstubAllEnvs();
    vi.resetModules();

    const { isCnyFireworksEnabled } = await import('@/config/featureFlags');

    expect(isCnyFireworksEnabled).toBe(false);
  });

  it('设置 VITE_ENABLE_CNY_FIREWORKS=true 时应启用烟花', async () => {
    vi.stubEnv('VITE_ENABLE_CNY_FIREWORKS', 'true');
    vi.resetModules();

    const { isCnyFireworksEnabled } = await import('@/config/featureFlags');

    expect(isCnyFireworksEnabled).toBe(true);
  });
});
