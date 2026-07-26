import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@/__tests__/utils/test-utils';
import { ThemeSwitcher } from '@/components/App/ThemeSwitcher';

const setThemeMock = vi.fn();
const useThemeMock = vi.fn();

vi.mock('next-themes', () => ({
  useTheme: () => useThemeMock(),
}));

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function createMatchMediaMock({
  reducedMotion = false,
  prefersDark = true,
}: {
  reducedMotion?: boolean;
  prefersDark?: boolean;
} = {}) {
  return vi.fn().mockImplementation((query: string) => ({
    matches:
      query === '(prefers-reduced-motion: reduce)'
        ? reducedMotion
        : query === '(prefers-color-scheme: dark)'
          ? prefersDark
          : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: createMatchMediaMock({
        reducedMotion: false,
        prefersDark: true,
      }),
    });
    setThemeMock.mockReset();
    useThemeMock.mockReturnValue({
      theme: 'system',
      resolvedTheme: 'dark',
      setTheme: setThemeMock,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('默认 system 时应显示系统模式', () => {
    render(<ThemeSwitcher />);

    expect(screen.getByTestId('theme-switcher-trigger')).toHaveTextContent('主题：跟随系统');
  });

  it('应展示三种主题选项', async () => {
    render(<ThemeSwitcher />);

    fireEvent.click(screen.getByTestId('theme-switcher-trigger'));

    expect(screen.getByTestId('theme-option-system')).toBeInTheDocument();
    expect(screen.getByTestId('theme-option-light')).toBeInTheDocument();
    expect(screen.getByTestId('theme-option-dark')).toBeInTheDocument();
  });

  it('应可切换到亮色、暗色和跟随系统', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: createMatchMediaMock({
        reducedMotion: true,
        prefersDark: true,
      }),
    });
    render(<ThemeSwitcher />);

    fireEvent.click(screen.getByTestId('theme-switcher-trigger'));
    fireEvent.click(screen.getByTestId('theme-option-light'));
    expect(setThemeMock).toHaveBeenCalledWith('light');
    await waitFor(() => {
      expect(screen.queryByTestId('theme-option-light')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('theme-switcher-trigger'));
    fireEvent.click(screen.getByTestId('theme-option-dark'));
    expect(setThemeMock).toHaveBeenCalledWith('dark');
    await waitFor(() => {
      expect(screen.queryByTestId('theme-option-dark')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('theme-switcher-trigger'));
    fireEvent.click(screen.getByTestId('theme-option-system'));
    expect(setThemeMock).toHaveBeenCalledWith('system');
  });

  it('应在有效主题变化时播放遮罩动画并延迟切换', async () => {
    vi.useFakeTimers();
    render(<ThemeSwitcher />);

    fireEvent.click(screen.getByTestId('theme-switcher-trigger'));
    fireEvent.click(screen.getByTestId('theme-option-light'));

    const trigger = screen.getByTestId('theme-switcher-trigger');
    expect(trigger).toBeDisabled();
    expect(screen.getByTestId('theme-transition-overlay')).toHaveClass(
      'theme-transition-overlay--wipe',
    );
    expect(setThemeMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(469);
    });
    expect(setThemeMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(setThemeMock).toHaveBeenCalledWith('light');
    expect(screen.getByTestId('theme-transition-overlay')).toHaveClass(
      'theme-transition-overlay--wipe',
    );

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByTestId('theme-transition-overlay')).toHaveClass(
      'theme-transition-overlay--fade',
    );

    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(screen.queryByTestId('theme-transition-overlay')).not.toBeInTheDocument();
    expect(trigger).not.toBeDisabled();
  });

  it('reduced motion 下应即时切换且不显示动画遮罩', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: createMatchMediaMock({
        reducedMotion: true,
        prefersDark: true,
      }),
    });
    render(<ThemeSwitcher />);

    fireEvent.click(screen.getByTestId('theme-switcher-trigger'));
    fireEvent.click(screen.getByTestId('theme-option-light'));

    expect(setThemeMock).toHaveBeenCalledWith('light');
    expect(screen.queryByTestId('theme-transition-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('theme-switcher-trigger')).not.toBeDisabled();
  });

  it('有效主题不变时应直接切换且不显示动画遮罩', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: createMatchMediaMock({
        reducedMotion: false,
        prefersDark: false,
      }),
    });
    useThemeMock.mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: setThemeMock,
    });
    render(<ThemeSwitcher />);

    fireEvent.click(screen.getByTestId('theme-switcher-trigger'));
    fireEvent.click(screen.getByTestId('theme-option-system'));

    expect(setThemeMock).toHaveBeenCalledWith('system');
    expect(screen.queryByTestId('theme-transition-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('theme-switcher-trigger')).not.toBeDisabled();
  });
});
