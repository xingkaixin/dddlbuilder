import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@/__tests__/utils/test-utils';
import { Header } from '@/components/App/Header';
import { AuthDialogs } from '@/auth/AuthDialogs';
import { WorkspaceMigrationDialog } from '@/components/App/WorkspaceMigrationDialog';
import type { AuthIdentityState } from '@/auth/AuthSessionProvider';

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
const retryWorkspaceYDocMock = vi.fn();
const mockWorkspaceYDoc = vi.hoisted(() => ({
  value: {} as any,
}));

const signedOutIdentity: AuthIdentityState = {
  status: 'signed_out',
  configured: true,
  userId: null,
  workspaceId: null,
  workspaceScope: null,
  email: null,
  name: null,
  emailVerified: false,
};

const signedInIdentity: AuthIdentityState = {
  status: 'signed_in',
  configured: true,
  userId: 'user-1',
  workspaceId: 'workspace-1',
  workspaceScope: { kind: 'user', userId: 'user-1', workspaceId: 'workspace-1' },
  email: 'user@example.com',
  name: 'User One',
  emailVerified: true,
};

vi.mock('@/i18n/LocaleContext', () => ({
  useLocale: () => ({
    locale: 'zh-CN',
    setLocale: vi.fn(),
  }),
}));

vi.mock('@/utils/docsLink', () => ({
  getDocsUrl: () => '/docs/zh/',
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'system',
    resolvedTheme: 'light',
    setTheme: vi.fn(),
  }),
}));

vi.mock('@/components/App/hooks/useThemeTransition', () => ({
  useThemeTransition: () => ({
    phase: 'idle',
    isTransitioning: false,
    targetEffectiveTheme: null,
    runThemeTransition: vi.fn(),
  }),
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
  DropdownMenuSub: ({ children }: { children: any }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: any }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: any }) => <div>{children}</div>,
  DropdownMenuRadioGroup: ({ children }: { children: any }) => <div>{children}</div>,
  DropdownMenuRadioItem: ({ children }: { children: any }) => (
    <button type="button">{children}</button>
  ),
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

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: any }) => <>{children}</>,
  Tooltip: ({ children }: { children: any }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: any }) => <>{children}</>,
  TooltipContent: ({ children }: { children: any }) => <>{children}</>,
}));

vi.mock('@/auth/AuthSessionProvider', () => {
  const useAuthIdentity = vi.fn(() => signedOutIdentity);
  const buildActions = () => ({
    signInWithEmail: signInWithEmailMock,
    signUpWithEmail: signUpWithEmailMock,
    updateUserName: vi.fn(),
    changePassword: vi.fn(),
    requestPasswordReset: requestPasswordResetMock,
    resetPassword: resetPasswordMock,
    sendVerificationEmail: sendVerificationEmailMock,
    signOut: signOutMock,
    refreshSession: refreshSessionMock,
  });
  const buildDialog = () => ({
    authDialogOpen: false,
    openAuthDialog: openAuthDialogMock,
    closeAuthDialog: closeAuthDialogMock,
  });
  let actions: ReturnType<typeof buildActions> | undefined;
  let dialog: ReturnType<typeof buildDialog> | undefined;
  const useAuthActions = vi.fn(() => (actions ??= buildActions()));
  const useAuthDialog = vi.fn(() => (dialog ??= buildDialog()));
  return { useAuthIdentity, useAuthActions, useAuthDialog };
});

vi.mock('@/providers/WorkspaceYDocProvider', () => ({
  useWorkspaceYDoc: () => mockWorkspaceYDoc.value,
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
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useAuthDialog, useAuthIdentity } = await import('@/auth/AuthSessionProvider');
    vi.mocked(useAuthIdentity).mockReturnValue(signedOutIdentity);
    vi.mocked(useAuthDialog).mockReturnValue({
      authDialogOpen: false,
      openAuthDialog: openAuthDialogMock,
      closeAuthDialog: closeAuthDialogMock,
    });
    runMigrationMock.mockReset();
    refreshSessionMock.mockReset();
    refreshSessionMock.mockResolvedValue(undefined);
    openAuthDialogMock.mockReset();
    closeAuthDialogMock.mockReset();
    successMock.mockReset();
    errorMock.mockReset();
    retryWorkspaceYDocMock.mockReset();
    mockWorkspaceYDoc.value = {
      doc: null,
      synced: false,
      localSynced: false,
      connectionState: 'idle',
      retry: retryWorkspaceYDocMock,
    };
    window.history.replaceState({}, '', '/');
  });

  const baseProps = {
    onShare: vi.fn(),
    isSharing: false,
    onOpenImport: vi.fn(),
    onOpenSettings: vi.fn(),
    currentDbType: 'mysql' as const,
    onImport: vi.fn(),
    savedTables: [],
    folderTree: [],
    onBatchImportComplete: vi.fn(),
    saveTable: vi.fn(),
    overwriteTable: vi.fn(),
    moveTableToFolder: vi.fn(),
  };

  it('routes import through the application dialog owner', async () => {
    const onOpenImport = vi.fn();
    render(<Header {...baseProps} onOpenImport={onOpenImport} />);
    fireEvent.click(await screen.findByRole('button', { name: '导入结构' }));
    expect(onOpenImport).toHaveBeenCalledOnce();
  });

  it('未传入烟花能力时不渲染灯笼按钮', async () => {
    await act(async () => {
      render(<Header {...baseProps} />);
    });

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
    const { useAuthDialog } = await import('@/auth/AuthSessionProvider');
    vi.mocked(useAuthDialog).mockReturnValue({
      authDialogOpen: true,
      openAuthDialog: openAuthDialogMock,
      closeAuthDialog: closeAuthDialogMock,
    });

    render(<AuthDialogs />);

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
    const { useAuthIdentity } = await import('@/auth/AuthSessionProvider');
    vi.mocked(useAuthIdentity).mockReturnValue(signedInIdentity);

    render(<Header {...baseProps} />);

    expect(screen.getByText('设置')).toBeInTheDocument();
    expect(screen.queryByText('额度 8800')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('退出登录'));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledTimes(1);
    });
  });

  it('登录后应展示工作区同步状态并支持失败重试', async () => {
    const { useAuthIdentity } = await import('@/auth/AuthSessionProvider');
    vi.mocked(useAuthIdentity).mockReturnValue(signedInIdentity);
    mockWorkspaceYDoc.value = {
      doc: null,
      synced: false,
      localSynced: true,
      connectionState: 'idle',
      retry: retryWorkspaceYDocMock,
    };

    const { rerender } = render(<Header {...baseProps} />);
    expect(screen.getByTestId('workspace-yjs-status')).toHaveTextContent('已打开本地副本');

    mockWorkspaceYDoc.value = {
      doc: null,
      synced: true,
      localSynced: true,
      connectionState: 'connected',
      retry: retryWorkspaceYDocMock,
    };
    rerender(<Header {...baseProps} onShare={vi.fn()} />);
    expect(screen.getByTestId('workspace-yjs-status')).toHaveTextContent('云端已同步');

    mockWorkspaceYDoc.value = {
      doc: null,
      synced: false,
      localSynced: true,
      connectionState: 'error',
      failureReason: 'service_unavailable',
      retry: retryWorkspaceYDocMock,
    };
    rerender(<Header {...baseProps} onShare={vi.fn()} />);
    expect(screen.getByTestId('workspace-yjs-status')).toHaveTextContent('同步服务不可用');
    fireEvent.click(screen.getByRole('button', { name: '重试同步' }));
    expect(retryWorkspaceYDocMock).toHaveBeenCalledTimes(1);
  });

  it('存在待迁移工作区时应展示迁移对话框并可执行迁移', async () => {
    const { useAuthIdentity } = await import('@/auth/AuthSessionProvider');
    const { useWorkspaceMigration } = await import('@/hooks/useWorkspaceMigration');

    vi.mocked(useAuthIdentity).mockReturnValue(signedInIdentity);
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
            drafts: [],
            folders: [],
            savedTables: [
              { normalizedName: 'users', name: 'users', state: {} as any, updatedAt: 1 },
            ],
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

    render(<WorkspaceMigrationDialog />);

    expect(screen.getByText('迁移匿名工作区')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '开始迁移' }));

    await waitFor(() => {
      expect(runMigrationMock).toHaveBeenCalledTimes(1);
    });
  });

  it('邮箱验证成功回跳后应刷新会话并提示成功', async () => {
    window.history.replaceState({}, '', '/?auth_action=verify-email');

    const { rerender } = render(<AuthDialogs />);

    await waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalledTimes(1);
      expect(successMock).toHaveBeenCalledWith('邮箱验证完成，当前可以直接登录');
    });

    expect(screen.getByText('邮箱验证完成')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我知道了' })).toBeInTheDocument();
    expect(window.location.search).toBe('');

    const { useAuthDialog } = await import('@/auth/AuthSessionProvider');
    vi.mocked(useAuthDialog).mockReturnValue({
      authDialogOpen: true,
      openAuthDialog: openAuthDialogMock,
      closeAuthDialog: closeAuthDialogMock,
    });
    rerender(<AuthDialogs />);

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(successMock).toHaveBeenCalledTimes(1);
  });

  it('重置密码回跳应只打开一次且取消后不再恢复命令', async () => {
    const { useAuthDialog } = await import('@/auth/AuthSessionProvider');
    vi.mocked(useAuthDialog).mockReturnValue({
      authDialogOpen: true,
      openAuthDialog: openAuthDialogMock,
      closeAuthDialog: closeAuthDialogMock,
    });
    window.history.replaceState({}, '', '/?auth_action=reset-password&token=reset-token');

    const { rerender } = render(<AuthDialogs />);

    await waitFor(() => {
      expect(openAuthDialogMock).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('新密码')).toBeInTheDocument();
    });
    expect(window.location.search).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(closeAuthDialogMock).toHaveBeenCalledTimes(1);

    vi.mocked(useAuthDialog).mockReturnValue({
      authDialogOpen: false,
      openAuthDialog: openAuthDialogMock,
      closeAuthDialog: closeAuthDialogMock,
    });
    rerender(<AuthDialogs />);

    expect(openAuthDialogMock).toHaveBeenCalledTimes(1);
  });
});
