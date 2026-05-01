import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/__tests__/utils/test-utils';
import { Header } from '@/components/App/Header';

const signInWithEmailMock = vi.fn();
const signUpWithEmailMock = vi.fn();
const requestPasswordResetMock = vi.fn();
const resetPasswordMock = vi.fn();
const sendVerificationEmailMock = vi.fn();
const signOutMock = vi.fn();
const runMigrationMock = vi.fn();
const refreshSessionMock = vi.fn();
const openAuthDialogMock = vi.fn();
const closeAuthDialogMock = vi.fn();
const successMock = vi.fn();
const errorMock = vi.fn();

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
    userId: null,
    email: null,
    name: null,
    emailVerified: false,
    creditBalance: null,
    creditsStatus: 'idle',
    authDialogOpen: false,
    signInWithEmail: signInWithEmailMock,
    signUpWithEmail: signUpWithEmailMock,
    updateUserName: vi.fn(),
    changePassword: vi.fn(),
    requestPasswordReset: requestPasswordResetMock,
    resetPassword: resetPasswordMock,
    sendVerificationEmail: sendVerificationEmailMock,
    signOut: signOutMock,
    refreshSession: refreshSessionMock,
    refreshCredits: vi.fn(),
    openAuthDialog: openAuthDialogMock,
    closeAuthDialog: closeAuthDialogMock,
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
    success: successMock,
    error: errorMock,
  }),
}));

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runMigrationMock.mockReset();
    refreshSessionMock.mockReset();
    refreshSessionMock.mockResolvedValue(undefined);
    openAuthDialogMock.mockReset();
    closeAuthDialogMock.mockReset();
    successMock.mockReset();
    errorMock.mockReset();
    window.history.replaceState({}, '', '/');
  });

  const baseProps = {
    onShare: vi.fn(),
    isSharing: false,
    currentDbType: 'mysql' as const,
    onImport: vi.fn(),
    savedTables: [],
    folderTree: [],
    onBatchImportComplete: vi.fn(),
    saveTable: vi.fn(),
    overwriteTable: vi.fn(),
    moveTableToFolder: vi.fn(),
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

  it('应展示问题反馈入口并在新标签页打开', () => {
    render(<Header {...baseProps} />);

    const feedbackLink = screen.getByRole('link', { name: '问题反馈' });

    expect(feedbackLink).toHaveAttribute(
      'href',
      'https://my.feishu.cn/share/base/form/shrcnqGnCdcvgRomQ5syagGW2He',
    );
    expect(feedbackLink).toHaveAttribute('target', '_blank');
    expect(feedbackLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('未登录时应展示登录入口并可提交邮箱密码登录', async () => {
    const { useAuthSession } = await import('@/auth/AuthSessionProvider');
    vi.mocked(useAuthSession).mockReturnValue({
      status: 'signed_out',
      configured: true,
      userId: null,
      email: null,
      name: null,
      emailVerified: false,
      creditBalance: null,
      creditsStatus: 'idle',
      authDialogOpen: true,
      signInWithEmail: signInWithEmailMock,
      signUpWithEmail: signUpWithEmailMock,
      updateUserName: vi.fn(),
      changePassword: vi.fn(),
      requestPasswordReset: requestPasswordResetMock,
      resetPassword: resetPasswordMock,
      sendVerificationEmail: sendVerificationEmailMock,
      signOut: signOutMock,
      refreshSession: refreshSessionMock,
      refreshCredits: vi.fn(),
      openAuthDialog: openAuthDialogMock,
      closeAuthDialog: closeAuthDialogMock,
    });

    render(<Header {...baseProps} />);

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: {
        value: 'user@example.com',
      },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: {
        value: 'password1234',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '登录 / 注册' }));

    await waitFor(() => {
      expect(signInWithEmailMock).toHaveBeenCalledWith('user@example.com', 'password1234');
    });
  });

  it('登录后应展示用户菜单并支持退出登录', async () => {
    const { useAuthSession } = await import('@/auth/AuthSessionProvider');
    vi.mocked(useAuthSession).mockReturnValue({
      status: 'signed_in',
      configured: true,
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User One',
      emailVerified: true,
      creditBalance: 8800,
      creditsStatus: 'ready',
      authDialogOpen: false,
      signInWithEmail: signInWithEmailMock,
      signUpWithEmail: signUpWithEmailMock,
      updateUserName: vi.fn(),
      changePassword: vi.fn(),
      requestPasswordReset: requestPasswordResetMock,
      resetPassword: resetPasswordMock,
      sendVerificationEmail: sendVerificationEmailMock,
      signOut: signOutMock,
      refreshSession: refreshSessionMock,
      refreshCredits: vi.fn(),
      openAuthDialog: openAuthDialogMock,
      closeAuthDialog: closeAuthDialogMock,
    });

    render(<Header {...baseProps} />);

    expect(screen.getByText('设置')).toBeInTheDocument();
    expect(screen.queryByText('额度 8800')).not.toBeInTheDocument();

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
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User One',
      emailVerified: true,
      creditBalance: 8800,
      creditsStatus: 'ready',
      authDialogOpen: false,
      signInWithEmail: signInWithEmailMock,
      signUpWithEmail: signUpWithEmailMock,
      updateUserName: vi.fn(),
      changePassword: vi.fn(),
      requestPasswordReset: requestPasswordResetMock,
      resetPassword: resetPasswordMock,
      sendVerificationEmail: sendVerificationEmailMock,
      signOut: signOutMock,
      refreshSession: refreshSessionMock,
      refreshCredits: vi.fn(),
      openAuthDialog: openAuthDialogMock,
      closeAuthDialog: closeAuthDialogMock,
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

  it('邮箱验证成功回跳后应刷新会话并提示成功', async () => {
    window.history.replaceState({}, '', '/?auth_action=verify-email');

    render(<Header {...baseProps} />);

    await waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalledTimes(1);
      expect(successMock).toHaveBeenCalledWith('邮箱验证完成，当前可以直接登录');
    });

    expect(screen.getByText('邮箱验证完成')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我知道了' })).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });
});
