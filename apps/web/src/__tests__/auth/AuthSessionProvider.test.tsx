import { render, screen, waitFor } from '@/__tests__/utils/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthSessionProvider, useAuthSession } from '@/auth/AuthSessionProvider';

const signInEmailMock = vi.fn();
const signUpEmailMock = vi.fn();
const forgetPasswordMock = vi.fn();
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
    forgetPassword: forgetPasswordMock,
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
      <span data-testid="credits">{session.creditBalance ?? ''}</span>
    </div>
  );
};

describe('AuthSessionProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    signInEmailMock.mockReset();
    signUpEmailMock.mockReset();
    forgetPasswordMock.mockReset();
    resetPasswordMock.mockReset();
    sendVerificationEmailMock.mockReset();
    signOutMock.mockReset();
    updateUserMock.mockReset();
    changePasswordMock.mockReset();
  });

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
    expect(screen.getByTestId('credits')).toHaveTextContent('8800');
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
});
