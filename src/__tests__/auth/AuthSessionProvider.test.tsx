import { render, screen, waitFor } from '@/__tests__/utils/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthSessionProvider, useAuthSession } from '@/auth/AuthSessionProvider';

const getSessionMock = vi.fn();
const onAuthStateChangeMock = vi.fn();

vi.mock('@/auth/supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
    },
  }),
}));

const SessionProbe = () => {
  const session = useAuthSession();
  return (
    <div>
      <span data-testid="status">{session.status}</span>
      <span data-testid="email">{session.email ?? ''}</span>
      <span data-testid="user-id">{session.appUserId ?? ''}</span>
      <span data-testid="credits">{session.creditBalance ?? ''}</span>
    </div>
  );
};

describe('AuthSessionProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getSessionMock.mockReset();
    onAuthStateChangeMock.mockReset();
    onAuthStateChangeMock.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });
  });

  it('restores signed-in state from existing session', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token',
          user: {
            id: 'external-user',
            email: 'user@example.com',
          },
        },
      },
      error: null,
    });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signedIn: true,
            user: {
              appUserId: 'supabase_external-user',
              externalUserId: 'external-user',
              email: 'user@example.com',
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
    expect(screen.getByTestId('user-id')).toHaveTextContent('supabase_external-user');
    expect(screen.getByTestId('credits')).toHaveTextContent('8800');
  });

  it('falls back to signed out when no session exists', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: null,
      },
      error: null,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('signed_out');
    });
  });
});
