import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/__tests__/utils/test-utils';
import { Header } from '@/components/App/Header';

const requestMagicLinkMock = vi.fn();
const signOutMock = vi.fn();
const runMigrationMock = vi.fn();

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

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: any }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: any }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: any }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: any }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <div />,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
  }: {
    children: any;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthSession: vi.fn(() => ({
    status: 'signed_out',
    configured: true,
    accessToken: null,
    externalUserId: null,
    appUserId: null,
    email: null,
    requestMagicLink: requestMagicLinkMock,
    signOut: signOutMock,
    refreshSession: vi.fn(),
  })),
}));

vi.mock('@/hooks/useWorkspaceMigration', () => ({
  useWorkspaceMigration: vi.fn(() => ({
    checking: false,
    running: false,
    open: false,
    pending: null,
    error: null,
    setOpen: vi.fn(),
    dismiss: vi.fn(),
    runMigration: runMigrationMock,
  })),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runMigrationMock.mockReset();
  });

  const baseProps = {
    onShare: vi.fn(),
    isSharing: false,
    currentDbType: 'mysql' as const,
    onImport: vi.fn(),
  };

  it('未传入烟花能力时不渲染灯笼按钮', () => {
    render(<Header {...baseProps} />);

    expect(screen.queryByRole('button', { name: '点击播放烟花' })).not.toBeInTheDocument();
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

  it('未登录时应展示登录入口并可发送 magic link', async () => {
    render(<Header {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '登录 / 注册' }));
    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: {
        value: 'user@example.com',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送登录链接' }));

    await waitFor(() => {
      expect(requestMagicLinkMock).toHaveBeenCalledWith('user@example.com');
    });
  });

  it('登录后应展示用户菜单并支持退出登录', async () => {
    const { useAuthSession } = await import('@/auth/AuthSessionProvider');
    vi.mocked(useAuthSession).mockReturnValue({
      status: 'signed_in',
      configured: true,
      accessToken: 'token',
      externalUserId: 'external-user',
      appUserId: 'supabase_external-user',
      email: 'user@example.com',
      requestMagicLink: requestMagicLinkMock,
      signOut: signOutMock,
      refreshSession: vi.fn(),
    });

    render(<Header {...baseProps} />);

    fireEvent.click(screen.getByText('退出登录'));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledTimes(1);
    });
  });

  it('存在待迁移工作区时应展示迁移对话框并可执行迁移', async () => {
    const { useAuthSession } = await import('@/auth/AuthSessionProvider');
    const { useWorkspaceMigration } = await import('@/hooks/useWorkspaceMigration');

    vi.mocked(useAuthSession).mockReturnValue({
      status: 'signed_in',
      configured: true,
      accessToken: 'token',
      externalUserId: 'external-user',
      appUserId: 'supabase_external-user',
      email: 'user@example.com',
      requestMagicLink: requestMagicLinkMock,
      signOut: signOutMock,
      refreshSession: vi.fn(),
    });
    vi.mocked(useWorkspaceMigration).mockReturnValue({
      checking: false,
      running: false,
      open: true,
      pending: {
        payload: {
          localFingerprint: 'fingerprint',
          idempotencyKey: 'migration-1',
          snapshot: {
            globalDraft: null,
            activeSession: null,
            savedTables: [{ normalizedName: 'users', name: 'users', state: {}, updatedAt: 1 }],
            savedDrafts: [],
          },
        },
        result: {
          status: 'ready',
          createdCount: 1,
          copiedCount: 0,
          skippedCount: 0,
          conflictCount: 0,
          conflicts: [],
        },
      },
      error: null,
      setOpen: vi.fn(),
      dismiss: vi.fn(),
      runMigration: runMigrationMock,
    });

    render(<Header {...baseProps} />);

    expect(screen.getByText('迁移匿名工作区')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '开始迁移' }));

    await waitFor(() => {
      expect(runMigrationMock).toHaveBeenCalledTimes(1);
    });
  });
});
