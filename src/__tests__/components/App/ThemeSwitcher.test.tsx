import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/__tests__/utils/test-utils';
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

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    setThemeMock.mockReset();
    useThemeMock.mockReturnValue({
      theme: 'system',
      resolvedTheme: 'dark',
      setTheme: setThemeMock,
    });
  });

  it('默认 system 时应显示系统模式及当前解析主题', () => {
    render(<ThemeSwitcher />);

    expect(screen.getByTestId('theme-switcher-trigger')).toHaveTextContent(
      '主题：系统（当前暗色）',
    );
  });

  it('应展示三种主题选项', async () => {
    render(<ThemeSwitcher />);

    fireEvent.pointerDown(screen.getByTestId('theme-switcher-trigger'));

    expect(screen.getByTestId('theme-option-system')).toBeInTheDocument();
    expect(screen.getByTestId('theme-option-light')).toBeInTheDocument();
    expect(screen.getByTestId('theme-option-dark')).toBeInTheDocument();
  });

  it('应可切换到亮色、暗色和跟随系统', async () => {
    render(<ThemeSwitcher />);

    fireEvent.pointerDown(screen.getByTestId('theme-switcher-trigger'));
    fireEvent.click(screen.getByTestId('theme-option-light'));
    expect(setThemeMock).toHaveBeenCalledWith('light');

    fireEvent.pointerDown(screen.getByTestId('theme-switcher-trigger'));
    fireEvent.click(screen.getByTestId('theme-option-dark'));
    expect(setThemeMock).toHaveBeenCalledWith('dark');

    fireEvent.pointerDown(screen.getByTestId('theme-switcher-trigger'));
    fireEvent.click(screen.getByTestId('theme-option-system'));
    expect(setThemeMock).toHaveBeenCalledWith('system');
  });
});
