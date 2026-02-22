import { renderHook, act } from '@testing-library/react';
import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { useThemeTransition } from '@/components/App/hooks/useThemeTransition';

describe('useThemeTransition', () => {
  let matchMediaMock: MockInstance;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.useFakeTimers();
    matchMediaMock = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((query) => {
        return {
          matches: query === '(prefers-color-scheme: dark)',
        } as any;
      });
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    matchMediaMock.mockRestore();
    window.matchMedia = originalMatchMedia;
    delete (document as any).startViewTransition;
    document.documentElement.classList.remove('theme-view-transition-active');
  });

  it('should return initial state', () => {
    const setTheme = vi.fn();
    const { result } = renderHook(() =>
      useThemeTransition({ theme: 'system', resolvedTheme: 'dark', setTheme }),
    );

    expect(result.current.phase).toBe('idle');
    expect(result.current.isTransitioning).toBe(false);
    expect(result.current.targetEffectiveTheme).toBe('dark');
    expect(result.current.showOverlay).toBe(false);
  });

  it('should handle missing matchMedia gracefully in getSystemTheme and prefersReducedMotion', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const setTheme = vi.fn();
    const { result } = renderHook(() =>
      useThemeTransition({ theme: 'system', resolvedTheme: 'dark', setTheme }),
    );

    // Call transition to evaluate resolveCurrentEffectiveTheme where matchMedia is used
    act(() => {
      result.current.runThemeTransition('light');
    });

    // Since matchMedia is missing, prefersReducedMotion returns true, so it will directly set theme
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('should return systemTheme from resolveCurrentEffectiveTheme', () => {
    const setTheme = vi.fn();
    const { result } = renderHook(() =>
      // Pass a theme that isn't light or dark, and invalid resolvedTheme
      useThemeTransition({
        theme: 'system',
        resolvedTheme: 'invalid',
        setTheme,
      }),
    );

    act(() => {
      result.current.runThemeTransition('light');
    });

    // wipe transition will start if it wasn't reduced motion
    expect(result.current.phase).toBe('wipe');

    // advance to SWITCH_THEME_AT_MS
    act(() => {
      vi.advanceTimersByTime(470);
    });
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('should evaluate resolveTargetEffectiveTheme when target is system and systemTheme is null', () => {
    // systemTheme = null by mocking matchMedia to undefined
    Object.defineProperty(window, 'matchMedia', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const setTheme = vi.fn();
    const { result } = renderHook(() =>
      useThemeTransition({ theme: 'system', resolvedTheme: 'dark', setTheme }),
    );

    act(() => {
      // Transition out of system and then to system to trigger it being target and different from current internally
      result.current.runThemeTransition('system');
    });

    // Because matchMedia is undefined, prefersReducedMotion returns true => bypasses transition
    expect(setTheme).toHaveBeenCalledWith('system');
  });

  it('should return resolvedTheme as light from resolveTargetEffectiveTheme', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const setTheme = vi.fn();
    const { result } = renderHook(() =>
      useThemeTransition({ theme: 'system', resolvedTheme: 'light', setTheme }),
    );

    act(() => {
      result.current.runThemeTransition('system');
    });

    expect(setTheme).toHaveBeenCalledWith('system');
  });

  it('should return null from resolveTargetEffectiveTheme when everything fails', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const setTheme = vi.fn();
    const { result } = renderHook(() =>
      useThemeTransition({
        theme: 'system',
        resolvedTheme: 'invalid',
        setTheme,
      }),
    );

    act(() => {
      result.current.runThemeTransition('system');
    });

    expect(setTheme).toHaveBeenCalledWith('system');
  });

  it('should not run transition if phase is not idle', () => {
    const setTheme = vi.fn();
    const { result } = renderHook(() =>
      useThemeTransition({ theme: 'light', resolvedTheme: 'light', setTheme }),
    );

    act(() => {
      result.current.runThemeTransition('dark');
    });

    expect(result.current.phase).toBe('wipe');

    // call again, shouldn't do anything
    act(() => {
      result.current.runThemeTransition('light');
    });

    expect(result.current.phase).toBe('wipe'); // still processing the first one
  });

  it('should return immediately if next effective theme equals current effective theme', () => {
    const setTheme = vi.fn();
    const { result } = renderHook(() =>
      useThemeTransition({ theme: 'light', resolvedTheme: 'light', setTheme }),
    );

    act(() => {
      // Trying to transition to light when we are already fully light
      result.current.runThemeTransition('light');
    });

    expect(setTheme).toHaveBeenCalledWith('light');
    expect(result.current.phase).toBe('idle');
  });

  it('should use ViewTransition when available', async () => {
    const setTheme = vi.fn();
    let transitionCallback: any;

    const mockFinished = Promise.resolve();
    (document as any).startViewTransition = vi.fn((cb: any) => {
      transitionCallback = cb;
      return { finished: mockFinished };
    });

    const { result } = renderHook(() =>
      useThemeTransition({ theme: 'light', resolvedTheme: 'light', setTheme }),
    );

    act(() => {
      result.current.runThemeTransition('dark');
    });

    expect((document as any).startViewTransition).toHaveBeenCalled();
    expect(result.current.phase).toBe('view');
    expect(
      document.documentElement.classList.contains(
        'theme-view-transition-active',
      ),
    ).toBe(true);

    // Simulate callback inside startViewTransition
    if (transitionCallback) {
      act(() => {
        transitionCallback();
      });
      expect(setTheme).toHaveBeenCalledWith('dark');
    }

    // Wait for promise resolution
    await act(async () => {
      await mockFinished;
    });

    expect(
      document.documentElement.classList.contains(
        'theme-view-transition-active',
      ),
    ).toBe(false);
    expect(result.current.phase).toBe('idle');
  });

  it('should fallback to wipe, fade and idle timers without startViewTransition', () => {
    const setTheme = vi.fn();
    const { result } = renderHook(() =>
      useThemeTransition({ theme: 'light', resolvedTheme: 'light', setTheme }),
    );

    act(() => {
      result.current.runThemeTransition('dark');
    });

    expect(result.current.phase).toBe('wipe');

    act(() => {
      vi.advanceTimersByTime(470);
    });
    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(result.current.phase).toBe('wipe');

    act(() => {
      vi.advanceTimersByTime(50); // total 520
    });
    expect(result.current.phase).toBe('fade');

    act(() => {
      vi.advanceTimersByTime(180); // total 700
    });
    expect(result.current.phase).toBe('idle');
  });
});
