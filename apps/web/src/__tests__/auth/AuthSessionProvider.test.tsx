import { render, screen, waitFor } from '@/__tests__/utils/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  AuthSessionProvider,
  useAuthSession,
  translateAuthError,
  signedOutState,
  fetchCurrentUser,
  fetchCreditBalance,
} from '@/auth/AuthSessionProvider';

const signInEmailMock = vi.fn();
const signUpEmailMock = vi.fn();
const requestPasswordResetMock = vi.fn();
const resetPasswordMock = vi.fn();
const sendVerificationEmailMock = vi.fn();
const signOutMock = vi.fn();
const updateUserMock = vi.fn();
const changePasswordMock = vi.fn();

vi.mock('@/auth/betterAuthClient', () => ({
  isBetterAuthConfigured: () => true,
  getBetterAuthClient: () => ({
    signIn: {
      email: signInEmailMock,
    },
    signUp: {
      email: signUpEmailMock,
    },
    requestPasswordReset: requestPasswordResetMock,
    resetPassword: resetPasswordMock,
    sendVerificationEmail: sendVerificationEmailMock,
    signOut: signOutMock,
    updateUser: updateUserMock,
    changePassword: changePasswordMock,
  }),
}));

const SessionProbe = () => {
  const session = useAuthSession();
  return (
    <div>
      <span data-testid="status">{session.status}</span>
      <span data-testid="email">{session.email ?? ''}</span>
      <span data-testid="user-id">{session.userId ?? ''}</span>
      <span data-testid="workspace-id">{session.workspaceId ?? ''}</span>
      <span data-testid="credits">{session.creditBalance ?? ''}</span>
      <span data-testid="credits-status">{session.creditsStatus}</span>
      <span data-testid="auth-dialog">{session.authDialogOpen ? 'open' : 'closed'}</span>
      <button data-testid="open-dialog" onClick={session.openAuthDialog}>
        Open Dialog
      </button>
      <button data-testid="close-dialog" onClick={session.closeAuthDialog}>
        Close Dialog
      </button>
      <button data-testid="refresh-credits" onClick={() => session.refreshCredits()}>
        Refresh Credits
      </button>
    </div>
  );
};

describe('AuthSessionProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    signInEmailMock.mockReset();
    signUpEmailMock.mockReset();
    requestPasswordResetMock.mockReset();
    resetPasswordMock.mockReset();
    sendVerificationEmailMock.mockReset();
    signOutMock.mockReset();
    updateUserMock.mockReset();
    changePasswordMock.mockReset();
  });

  describe('translateAuthError', () => {
    it('maps "not verified" to emailNotVerified', () => {
      expect(translateAuthError('Email not verified', 'fallback')).toBe(
        '邮箱尚未验证，请先查收验证邮件',
      );
    });

    it('maps "verify your email" to emailNotVerified', () => {
      expect(translateAuthError('Please verify your email', 'fallback')).toBe(
        '邮箱尚未验证，请先查收验证邮件',
      );
    });

    it('maps "invalid email" to invalidCredentials', () => {
      expect(translateAuthError('Invalid email', 'fallback')).toBe('邮箱或密码错误');
    });

    it('maps "incorrect password" to invalidCredentials', () => {
      expect(translateAuthError('Incorrect password', 'fallback')).toBe('邮箱或密码错误');
    });

    it('maps "invalid credentials" to invalidCredentials', () => {
      expect(translateAuthError('Invalid credentials provided', 'fallback')).toBe('邮箱或密码错误');
    });

    it('maps "not found" to userNotFound', () => {
      expect(translateAuthError('User not found', 'fallback')).toBe('账号不存在');
    });

    it('maps "already exists" to userAlreadyExists', () => {
      expect(translateAuthError('User already exists', 'fallback')).toBe('该邮箱已注册');
    });

    it('maps "invalid token" to resetTokenInvalid', () => {
      expect(translateAuthError('Invalid token', 'fallback')).toBe('密码重置链接无效或已过期');
    });

    it('maps "expired" to resetTokenInvalid', () => {
      expect(translateAuthError('Token expired', 'fallback')).toBe('密码重置链接无效或已过期');
    });

    it('maps "too short" to passwordTooShort', () => {
      expect(translateAuthError('Password too short', 'fallback')).toBe('密码长度不足');
    });

    it('maps "password must be" to passwordTooShort', () => {
      expect(translateAuthError('Password must be at least 8 chars', 'fallback')).toBe(
        '密码长度不足',
      );
    });

    it('maps "rate limit" to tooManyRequests', () => {
      expect(translateAuthError('Rate limit exceeded', 'fallback')).toBe(
        '操作过于频繁，请稍后再试',
      );
    });

    it('maps "too many" to tooManyRequests', () => {
      expect(translateAuthError('Too many attempts', 'fallback')).toBe('操作过于频繁，请稍后再试');
    });

    it('maps "disabled" to accountDisabled', () => {
      expect(translateAuthError('Account disabled', 'fallback')).toBe('账号已被禁用');
    });

    it('uses fallbackKey for unknown messages', () => {
      expect(translateAuthError('some random error', 'header.auth.signInFailed')).toBe('登录失败');
    });
  });

  describe('signedOutState', () => {
    it('returns correct state when configured is true', () => {
      const state = signedOutState(true);
      expect(state).toEqual({
        status: 'signed_out',
        configured: true,
        userId: null,
        workspaceId: null,
        email: null,
        name: null,
        emailVerified: false,
        creditBalance: null,
        creditsStatus: 'idle',
        authDialogOpen: false,
      });
    });

    it('returns correct state when configured is false', () => {
      const state = signedOutState(false);
      expect(state.configured).toBe(false);
      expect(state.status).toBe('signed_out');
    });
  });

  describe('fetchCurrentUser', () => {
    it('returns user data on success', async () => {
      const userData = {
        signedIn: true,
        user: { userId: 'u1', email: 'a@b.com', name: 'A', emailVerified: true },
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(userData)));

      const result = await fetchCurrentUser();
      expect(result).toEqual(userData);
    });

    it('returns signedOut when not signed in', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ signedIn: false, user: null })),
      );

      const result = await fetchCurrentUser();
      expect(result.signedIn).toBe(false);
    });

    it('throws with server error message on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
      );

      await expect(fetchCurrentUser()).rejects.toThrow('Server error');
    });

    it('throws default message when error payload has no string error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 123 }), { status: 500 }),
      );

      await expect(fetchCurrentUser()).rejects.toThrow('Failed to load current user');
    });

    it('throws default message on empty response body', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));

      await expect(fetchCurrentUser()).rejects.toThrow('Empty user response');
    });

    it('throws on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failed'));

      await expect(fetchCurrentUser()).rejects.toThrow('Network failed');
    });
  });

  describe('fetchCreditBalance', () => {
    it('returns balance on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ balance: 100 })),
      );

      const result = await fetchCreditBalance();
      expect(result).toBe(100);
    });

    it('returns 0 when balance is not a number', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ balance: 'not-a-number' })),
      );

      const result = await fetchCreditBalance();
      expect(result).toBe(0);
    });

    it('throws with server error message on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Credit error' }), { status: 500 }),
      );

      await expect(fetchCreditBalance()).rejects.toThrow('Credit error');
    });

    it('throws default message when error is not a string', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 123 }), { status: 500 }),
      );

      await expect(fetchCreditBalance()).rejects.toThrow('Failed to load credit balance');
    });

    it('throws on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failed'));

      await expect(fetchCreditBalance()).rejects.toThrow('Network failed');
    });
  });

  describe('component behavior', () => {
    it('restores signed-in state from existing session', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              signedIn: true,
              user: {
                userId: 'user-1',
                email: 'user@example.com',
                emailVerified: true,
                name: 'User One',
              },
            }),
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ balance: 8800 })));

      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('signed_in');
      });
      expect(screen.getByTestId('email')).toHaveTextContent('user@example.com');
      expect(screen.getByTestId('user-id')).toHaveTextContent('user-1');
      await waitFor(() => {
        expect(screen.getByTestId('credits')).toHaveTextContent('8800');
      });
    });

    it('publishes workspace id before background sync finishes', async () => {
      const never = new Promise<Response>(() => {});
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              signedIn: true,
              user: {
                userId: 'user-1',
                email: 'user@example.com',
                emailVerified: true,
                name: 'User One',
              },
            }),
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ balance: 8800 })))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ activeWorkspaceId: 'ws-1', workspaces: [] })),
        )
        .mockReturnValue(never);

      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('workspace-id')).toHaveTextContent('ws-1');
      });
      expect(screen.getByTestId('status')).toHaveTextContent('signed_in');
    });

    it('publishes workspace id while initial credit request is still pending', async () => {
      let resolveCredit!: (response: Response) => void;
      const slowCredit = new Promise<Response>((resolve) => {
        resolveCredit = resolve;
      });
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              signedIn: true,
              user: {
                userId: 'user-1',
                email: 'user@example.com',
                emailVerified: true,
                name: 'User One',
              },
            }),
          ),
        )
        .mockReturnValueOnce(slowCredit)
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ activeWorkspaceId: 'ws-1', workspaces: [] })),
        )
        .mockResolvedValue(
          new Response(JSON.stringify({ workspaceId: 'ws-1', cursor: 0, entities: [] })),
        );

      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('workspace-id')).toHaveTextContent('ws-1');
      });
      expect(screen.getByTestId('credits-status')).toHaveTextContent('loading');

      resolveCredit(new Response(JSON.stringify({ balance: 8800 })));
      await waitFor(() => {
        expect(screen.getByTestId('credits')).toHaveTextContent('8800');
      });
    });

    it('falls back to signed out when no session exists', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            signedIn: false,
            user: null,
          }),
        ),
      );

      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('signed_out');
      });
    });

    it('shows signed_out when better-auth is not configured', async () => {
      await vi.importMock('@/auth/betterAuthClient');
      vi.doMock('@/auth/betterAuthClient', () => ({
        isBetterAuthConfigured: () => false,
        getBetterAuthClient: () => null,
      }));

      // Re-import to pick up the new mock
      const { AuthSessionProvider: UnconfiguredProvider, useAuthSession: UnconfiguredHook } =
        await import('@/auth/AuthSessionProvider');

      const Probe = () => {
        const session = UnconfiguredHook();
        return <span data-testid="unconfigured-status">{session.status}</span>;
      };

      render(
        <UnconfiguredProvider>
          <Probe />
        </UnconfiguredProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('unconfigured-status')).toHaveTextContent('signed_out');
      });

      vi.doUnmock('@/auth/betterAuthClient');
    });

    it('supports updating username and changing password', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              signedIn: true,
              user: {
                userId: 'user-1',
                email: 'user@example.com',
                emailVerified: true,
                name: 'User One',
              },
            }),
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ balance: 8800 })))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              signedIn: true,
              user: {
                userId: 'user-1',
                email: 'user@example.com',
                emailVerified: true,
                name: 'User Two',
              },
            }),
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ balance: 8800 })));

      let sessionApi: ReturnType<typeof useAuthSession> | null = null;
      const Probe = () => {
        sessionApi = useAuthSession();
        return null;
      };

      render(
        <AuthSessionProvider>
          <Probe />
        </AuthSessionProvider>,
      );

      await waitFor(() => {
        expect(sessionApi?.status).toBe('signed_in');
      });

      updateUserMock.mockResolvedValue({ error: null });
      changePasswordMock.mockResolvedValue({ error: null });

      await sessionApi?.updateUserName('User Two');
      await sessionApi?.changePassword('old-pass', 'new-pass');

      expect(updateUserMock).toHaveBeenCalledWith({ name: 'User Two' });
      expect(changePasswordMock).toHaveBeenCalledWith({
        currentPassword: 'old-pass',
        newPassword: 'new-pass',
        revokeOtherSessions: false,
      });
    });

    it('opens and closes auth dialog', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            signedIn: false,
            user: null,
          }),
        ),
      );

      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('signed_out');
      });

      expect(screen.getByTestId('auth-dialog')).toHaveTextContent('closed');

      screen.getByTestId('open-dialog').click();
      await waitFor(() => {
        expect(screen.getByTestId('auth-dialog')).toHaveTextContent('open');
      });

      screen.getByTestId('close-dialog').click();
      await waitFor(() => {
        expect(screen.getByTestId('auth-dialog')).toHaveTextContent('closed');
      });
    });

    it('refreshes credits successfully', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              signedIn: true,
              user: {
                userId: 'user-1',
                email: 'user@example.com',
                emailVerified: true,
                name: 'User One',
              },
            }),
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ balance: 100 })))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ activeWorkspaceId: 'ws-1', workspaces: [] })),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ balance: 200 })));

      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('signed_in');
      });
      await waitFor(() => {
        expect(screen.getByTestId('credits')).toHaveTextContent('100');
      });

      screen.getByTestId('refresh-credits').click();
      await waitFor(() => {
        expect(screen.getByTestId('credits')).toHaveTextContent('200');
      });
      expect(screen.getByTestId('credits-status')).toHaveTextContent('ready');
    });

    it('handles credit refresh failure', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              signedIn: true,
              user: {
                userId: 'user-1',
                email: 'user@example.com',
                emailVerified: true,
                name: 'User One',
              },
            }),
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ balance: 100 })))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'Credit load failed' }), { status: 500 }),
        );

      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('signed_in');
      });

      screen.getByTestId('refresh-credits').click();
      await waitFor(() => {
        expect(screen.getByTestId('credits-status')).toHaveTextContent('error');
      });
    });

    it('handles initial credit balance fetch failure', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              signedIn: true,
              user: {
                userId: 'user-1',
                email: 'user@example.com',
                emailVerified: true,
                name: 'User One',
              },
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'Credit load failed' }), { status: 500 }),
        );

      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('signed_in');
      });
      await waitFor(() => {
        expect(screen.getByTestId('credits-status')).toHaveTextContent('error');
      });
    });

    it('keeps the session signed in when workspace loading fails', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              signedIn: true,
              user: {
                userId: 'user-1',
                email: 'user@example.com',
                emailVerified: true,
                name: 'User One',
              },
            }),
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ balance: 100 })))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'Workspace load failed' }), { status: 500 }),
        );

      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('credits')).toHaveTextContent('100');
      });
      expect(screen.getByTestId('status')).toHaveTextContent('signed_in');
      expect(screen.getByTestId('workspace-id')).toHaveTextContent('');
    });

    it('does nothing when refreshing credits while not signed in', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            signedIn: false,
            user: null,
          }),
        ),
      );

      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('signed_out');
      });

      // Should not throw
      screen.getByTestId('refresh-credits').click();
      await waitFor(() => {
        expect(screen.getByTestId('credits-status')).toHaveTextContent('idle');
      });
    });
  });
});
