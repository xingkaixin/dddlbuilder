import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedEffect } from '@/hooks/useDebouncedEffect';

describe('useDebouncedEffect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should run effect after delay', () => {
    const effect = vi.fn();

    renderHook(
      ({ value }) => {
        useDebouncedEffect(effect, [value], 100);
      },
      { initialProps: { value: 1 } },
    );

    expect(effect).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('should clear previous timer and only run latest effect on deps change', () => {
    const effect = vi.fn();

    const { rerender } = renderHook(
      ({ value }) => {
        useDebouncedEffect(effect, [value], 100);
      },
      { initialProps: { value: 1 } },
    );

    act(() => {
      vi.advanceTimersByTime(50);
    });
    rerender({ value: 2 });

    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(effect).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('should call cleanup returned by effect on unmount', () => {
    const cleanup = vi.fn();
    const effect = vi.fn(() => cleanup);

    const { unmount } = renderHook(() => {
      useDebouncedEffect(effect, [], 100);
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(effect).toHaveBeenCalledTimes(1);

    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
