import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFireworksIntro } from '@/components/App/hooks/useFireworksIntro';

describe('useFireworksIntro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(localStorage.getItem).mockReturnValue(null);
  });

  it('开关关闭时不读取 localStorage，也不触发首屏烟花', () => {
    const setShowFireworks = vi.fn();

    renderHook(() =>
      useFireworksIntro({
        enabled: false,
        setShowFireworks,
      }),
    );

    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(setShowFireworks).not.toHaveBeenCalled();
  });

  it('开关开启且未展示过时应触发首屏烟花', () => {
    const setShowFireworks = vi.fn();
    vi.mocked(localStorage.getItem).mockReturnValue(null);

    renderHook(() =>
      useFireworksIntro({
        enabled: true,
        setShowFireworks,
      }),
    );

    expect(localStorage.getItem).toHaveBeenCalledWith(
      'ddlbuilder:fireworks:cny:shown:2026:v1',
    );
    expect(setShowFireworks).toHaveBeenCalledWith(true);
  });

  it('完成回调在开关开启时应关闭烟花并记录 localStorage', () => {
    const setShowFireworks = vi.fn();

    const { result } = renderHook(() =>
      useFireworksIntro({
        enabled: true,
        setShowFireworks,
      }),
    );

    result.current.handleFireworksComplete();

    expect(setShowFireworks).toHaveBeenLastCalledWith(false);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'ddlbuilder:fireworks:cny:shown:2026:v1',
      'true',
    );
  });
});
