import { toast } from 'sonner';
import { act, render, screen, waitFor } from '@/__tests__/utils/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { setupMemoryLocalStorage } from '@/__tests__/utils/memoryLocalStorage';
import {
  readWorkspaceIdentity,
  writeWorkspaceIdentity,
  WORKSPACE_IDENTITY_KEY,
} from '@/services/workspaceIdentity';
import {
  AuthSessionProvider,
  useAuthActions,
  useAuthCredits,
  useAuthDialog,
  useAuthIdentity,
} from '@/auth/AuthSessionProvider';

const signInEmailMock = vi.fn();
const signUpEmailMock = vi.fn();
const requestPasswordResetMock = vi.fn();
const resetPasswordMock = vi.fn();
const sendVerificationEmailMock = vi.fn();
const signOutMock = vi.fn();
const updateUserMock = vi.fn();
const changePasswordMock = vi.fn();
const { clearLocalWorkspaceDataMock, prepareWorkspaceSignOutMock } = vi.hoisted(() => ({
  clearLocalWorkspaceDataMock: vi.fn(),
  prepareWorkspaceSignOutMock: vi.fn(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 认证与工作区替换用于隔离 provider 的会话状态编排和副作用。
vi.mock('@/services/workspaceYDocStorage', () => ({
  prepareWorkspaceSignOut: prepareWorkspaceSignOutMock,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 认证与工作区替换用于隔离 provider 的会话状态编排和副作用。
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

// oxlint-disable-next-line anti-slop/no-module-mocking -- 认证与工作区替换用于隔离 provider 的会话状态编排和副作用。
vi.mock('@/services/workspaceAccountService', async (importOriginal) => ({
  ...(await importOriginal()),
  clearLocalWorkspaceData: clearLocalWorkspaceDataMock,
}));

const useSessionProbeState = () => ({
  ...useAuthIdentity(),
  ...useAuthActions(),
  ...useAuthCredits(),
  ...useAuthDialog(),
});

const SessionProbe = () => {
  const session = useSessionProbeState();

  return (
    <div>
      <span data-testid="status">{session.status}</span>
      <span data-testid="user-id">{session.userId ?? ''}</span>
      <span data-testid="workspace-scope">
        {session.workspaceScope
          ? `${session.workspaceScope.userId}:${session.workspaceScope.workspaceId}`
          : ''}
      </span>
    </div>
  );
};

describe('AuthSessionProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupMemoryLocalStorage();
    signInEmailMock.mockReset();
    signUpEmailMock.mockReset();
    requestPasswordResetMock.mockReset();
    resetPasswordMock.mockReset();
    sendVerificationEmailMock.mockReset();
    signOutMock.mockReset();
    updateUserMock.mockReset();
    changePasswordMock.mockReset();
    clearLocalWorkspaceDataMock.mockReset();
    prepareWorkspaceSignOutMock.mockReset().mockResolvedValue(undefined);
  });

  describe('component behavior', () => {
    it('does not restore an account from an auth response arriving after another tab signs out', async () => {
      writeWorkspaceIdentity({ kind: 'user', userId: 'user-1', workspaceId: 'ws-1' });
      let respond = (_response: Response) => {};

      const response = new Promise<Response>((resolve) => {
        respond = resolve;
      });
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        if (input === '/api/me') return response;
        if (input === '/api/credits/balance')
          return Response.json({ balance: 100, version: 1, userId: 'user-1' });

        return Response.json({ workspaceId: 'ws-1' });
      });
      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );
      await act(async () => {
        localStorage.removeItem(WORKSPACE_IDENTITY_KEY);
        window.dispatchEvent(
          new StorageEvent('storage', { key: WORKSPACE_IDENTITY_KEY, newValue: null }),
        );
        respond(
          Response.json({
            signedIn: true,
            user: {
              userId: 'user-1',
              name: 'User',
              email: 'user@example.com',
              emailVerified: true,
            },
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(screen.getByTestId('status')).toHaveTextContent('signed_out');
      expect(screen.getByTestId('workspace-scope').textContent).toBe('');
      expect(readWorkspaceIdentity()).toBeNull();
    });

    it.each(['expired', 'unavailable'])(
      'keeps the local workspace when authentication is %s',
      async (result) => {
        writeWorkspaceIdentity({
          kind: 'user',
          userId: 'remembered-user',
          workspaceId: 'remembered-ws',
        });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          result === 'expired'
            ? Response.json({ signedIn: false, user: null })
            : Response.json({ error: 'Unavailable' }, { status: 503 }),
        );
        render(
          <AuthSessionProvider>
            <SessionProbe />
          </AuthSessionProvider>,
        );
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed_out'));
        expect(screen.getByTestId('workspace-scope')).toHaveTextContent(
          'remembered-user:remembered-ws',
        );
        expect(screen.getByTestId('user-id')).toBeEmptyDOMElement();
      },
    );

    it.each(['remembered-user', 'different-user'])(
      'only reuses a local workspace owned by authenticated user %s',
      async (userId) => {
        writeWorkspaceIdentity({
          kind: 'user',
          userId: 'remembered-user',
          workspaceId: 'remembered-ws',
        });
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
          if (input === '/api/me')
            return Response.json({
              signedIn: true,
              user: { userId, name: 'User', email: 'user@example.com', emailVerified: true },
            });

          return new Promise(() => {});
        });
        render(
          <AuthSessionProvider>
            <SessionProbe />
          </AuthSessionProvider>,
        );
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed_in'));
        expect(screen.getByTestId('workspace-scope').textContent).toBe(
          userId === 'remembered-user' ? 'remembered-user:remembered-ws' : '',
        );
      },
    );

    it.each([true, false])(
      'protects local data when sync confirmation succeeds: %s',
      async (confirmed) => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
          if (input === '/api/me')
            return Response.json({
              signedIn: true,
              user: {
                userId: 'user-1',
                email: 'user@example.com',
                name: 'User',
                emailVerified: true,
              },
            });
          if (input === '/api/credits/balance')
            return Response.json({ balance: 100, version: 1, userId: 'user-1' });

          return Response.json({ workspaceId: 'ws-1' });
        });
        let settle = () => {};

        prepareWorkspaceSignOutMock.mockImplementation(
          () =>
            new Promise<void>((resolve, reject) => {
              settle = () => (confirmed ? resolve() : reject(new Error('Unconfirmed changes')));
            }),
        );
        signOutMock.mockResolvedValue({ error: null });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        // SAFETY: The probe assigns the provider return value before assertions read current.
        const session = {
          current: null as ReturnType<typeof useSessionProbeState> | null,
        };
        const Probe = () => {
          const api = useSessionProbeState();
          useEffect(() => {
            session.current = api;
          }, [api]);

          return <span data-testid="sign-out-status">{api.status}</span>;
        };
        render(
          <AuthSessionProvider>
            <Probe />
          </AuthSessionProvider>,
        );
        await waitFor(() => expect(session.current?.workspaceId).toBe('ws-1'));

        if (!session.current) throw new Error('Session not loaded');

        const outcome = session.current.signOut().then(
          () => 'signed_out',
          () => 'cancelled',
        );
        await waitFor(() => expect(prepareWorkspaceSignOutMock).toHaveBeenCalledWith('ws-1'));
        expect(signOutMock).not.toHaveBeenCalled();
        expect(clearLocalWorkspaceDataMock).not.toHaveBeenCalled();
        settle();
        expect(await outcome).toBe(confirmed ? 'signed_out' : 'cancelled');
        expect(signOutMock).toHaveBeenCalledTimes(confirmed ? 1 : 0);
        expect(clearLocalWorkspaceDataMock).toHaveBeenCalledTimes(confirmed ? 1 : 0);
        expect(readWorkspaceIdentity() === null).toBe(confirmed);
        await waitFor(() =>
          expect(screen.getByTestId('sign-out-status')).toHaveTextContent(
            confirmed ? 'signed_out' : 'signed_in',
          ),
        );
      },
    );

    it('keeps the client signed out when local workspace cleanup fails', async () => {
      const notice = vi.spyOn(toast, 'error');
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
          new Response(JSON.stringify({ balance: 8800, version: 1, userId: 'user-1' })),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ workspaceId: 'ws-1' })))
        .mockResolvedValue(
          new Response(JSON.stringify({ workspaceId: 'ws-1', cursor: 0, entities: [] })),
        );
      signOutMock.mockResolvedValue({ error: null });
      clearLocalWorkspaceDataMock.mockRejectedValue(new Error('IndexedDB unavailable'));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      // SAFETY: The probe assigns the provider return value before assertions read current.
      const sessionApi = {
        current: null as ReturnType<typeof useSessionProbeState> | null,
      };
      const Probe = () => {
        const api = useSessionProbeState();
        useEffect(() => {
          sessionApi.current = api;
        }, [api]);

        return <span data-testid="sign-out-status">{api.status}</span>;
      };

      render(
        <AuthSessionProvider>
          <Probe />
        </AuthSessionProvider>,
      );

      await waitFor(() => expect(sessionApi.current?.workspaceId).toBe('ws-1'));
      await expect(sessionApi.current?.signOut()).resolves.toBeUndefined();
      await waitFor(() => {
        expect(screen.getByTestId('sign-out-status')).toHaveTextContent('signed_out');
      });
      const retained = localStorage.getItem('ddlbuilder:workspace-caches:v1');
      expect(retained).toContain('pending_cleanup');
      expect(notice).toHaveBeenCalledWith(
        expect.stringContaining('本机副本未能清理'),
        expect.objectContaining({ action: expect.any(Object) }),
      );
      expect(consoleError).toHaveBeenCalledWith(
        JSON.stringify({
          event: 'sign_out_local_cleanup_failure',
          userId: 'user-1',
          workspaceId: 'ws-1',
        }),
        expect.any(Error),
      );
    });
  });
});
