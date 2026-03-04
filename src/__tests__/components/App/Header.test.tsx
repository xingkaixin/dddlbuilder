import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/__tests__/utils/test-utils';
import { Header } from '@/components/App/Header';

vi.mock('@/i18n/LocaleContext', () => ({
  useLocale: () => ({
    locale: 'zh-CN',
  }),
}));

vi.mock('@/utils/docsLink', () => ({
  getDocsUrl: () => '/docs/zh/',
}));

vi.mock('@/components/App/ThemeSwitcher', () => ({
  ThemeSwitcher: () => <button type="button">主题</button>,
}));

vi.mock('@/components/App/LocaleSwitcher', () => ({
  LocaleSwitcher: () => <button type="button">语言</button>,
}));

vi.mock('@/components/ImportSqlDialog', () => ({
  ImportSqlDialog: ({ triggerLabel }: { triggerLabel: string }) => (
    <button type="button">{triggerLabel}</button>
  ),
}));

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseProps = {
    onShare: vi.fn(),
    isSharing: false,
    currentDbType: 'mysql' as const,
    onImport: vi.fn(),
  };

  it('未传入烟花能力时不渲染灯笼按钮', () => {
    render(<Header {...baseProps} />);

    expect(
      screen.queryByRole('button', { name: '点击播放烟花' }),
    ).not.toBeInTheDocument();
  });

  it('传入烟花能力时应渲染灯笼按钮并触发回调', () => {
    const onPlayFireworks = vi.fn();

    render(<Header {...baseProps} onPlayFireworks={onPlayFireworks} />);

    const fireworksButton = screen.getByRole('button', {
      name: '点击播放烟花',
    });
    fireEvent.click(fireworksButton);

    expect(onPlayFireworks).toHaveBeenCalledTimes(1);
  });
});
