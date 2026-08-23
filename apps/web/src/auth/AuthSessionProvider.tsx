import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { clearLocalWorkspaceData } from '@/services/workspaceAccountService';
import { currentUserOptions, authQueryKeys } from '@/queries/auth';
import { creditBalanceOptions, creditQueryKeys } from '@/queries/credits';
import { currentWorkspaceOptions, workspaceQueryKeys } from '@/queries/workspaces';
import { workspaceMigrationQueryKeys } from '@/queries/workspaceMigration';
import { fetchCurrentUser } from '@/services/authService';
import { fetchCreditBalance } from '@/services/creditService';
import { getBetterAuthClient, isBetterAuthConfigured } from './betterAuthClient';

export { fetchCurrentUser, fetchCreditBalance };

export type UserSessionState = {
  status: 'loading' | 'signed_out' | 'signed_in';
  configured: boolean;
  userId: string | null;
  workspaceId: string | null;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  creditBalance: number | null;
  creditsStatus: 'idle' | 'loading' | 'ready' | 'error';
  authDialogOpen: boolean;
};

type SignUpInput = {
  name: string;
  email: string;
  password: string;
  turnstileToken: string;
};

const verifyEmailCallbackURL = () => `${window.location.origin}/?auth_action=verify-email`;

type AuthSessionContextValue = UserSessionState & {
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (input: SignUpInput) => Promise<void>;
  updateUserName: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  sendVerificationEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  openAuthDialog: () => void;
  closeAuthDialog: () => void;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export const translateAuthError = (serverMessage: string, fallbackKey: string): string => {
  const msg = serverMessage.toLowerCase();
  if (msg.includes('not verified') || msg.includes('verify your email')) {
    return i18n.t('header.auth.emailNotVerified');
  }
  if (
    msg.includes('invalid email') ||
    msg.includes('incorrect password') ||
    msg.includes('invalid credentials')
  ) {
    return i18n.t('header.auth.invalidCredentials');
  }
  if (msg.includes('not found')) {
    return i18n.t('header.auth.userNotFound');
  }
  if (msg.includes('already exists')) {
    return i18n.t('header.auth.userAlreadyExists');
  }
  if (msg.includes('invalid token') || msg.includes('expired')) {
    return i18n.t('header.auth.resetTokenInvalid');
  }
  if (msg.includes('too short') || msg.includes('password must be')) {
    return i18n.t('header.auth.passwordTooShort');
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return i18n.t('header.auth.tooManyRequests');
  }
  if (msg.includes('disabled')) {
    return i18n.t('header.auth.accountDisabled');
  }
  return i18n.t(fallbackKey);
};

export const signedOutState = (configured: boolean): UserSessionState => ({
  status: 'signed_out',
  configured,
  userId: null,
  workspaceId: null,
  email: null,
  name: null,
  emailVerified: false,
  creditBalance: null,
  creditsStatus: 'idle',
  authDialogOpen: false,
});

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const configured = isBetterAuthConfigured();
  const client = getBetterAuthClient();
  const queryClient = useQueryClient();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const currentUserQuery = useQuery({
    ...currentUserOptions(),
    enabled: configured,
  });
  const currentUser = currentUserQuery.data?.signedIn ? currentUserQuery.data.user : null;
  const userId = currentUser?.userId ?? null;
  const creditBalanceQuery = useQuery({
    ...creditBalanceOptions(userId ?? ''),
    enabled: Boolean(userId),
  });
  const currentWorkspaceQuery = useQuery({
    ...currentWorkspaceOptions(userId ?? ''),
    enabled: Boolean(userId),
  });
  const refetchCurrentUser = currentUserQuery.refetch;
  const state = useMemo<UserSessionState>(() => {
    if (!configured) return signedOutState(false);

    const status = currentUser
      ? 'signed_in'
      : currentUserQuery.isPending || currentUserQuery.isFetching
        ? 'loading'
        : 'signed_out';
    return {
      status,
      configured: true,
      userId,
      workspaceId: currentWorkspaceQuery.data?.workspaceId ?? null,
      email: currentUser?.email ?? null,
      name: currentUser?.name ?? null,
      emailVerified: currentUser?.emailVerified ?? false,
      creditBalance: creditBalanceQuery.data ?? null,
      creditsStatus: !userId
        ? 'idle'
        : creditBalanceQuery.isPending
          ? 'loading'
          : creditBalanceQuery.isError
            ? 'error'
            : 'ready',
      authDialogOpen,
    };
  }, [
    authDialogOpen,
    configured,
    creditBalanceQuery.data,
    creditBalanceQuery.isError,
    creditBalanceQuery.isPending,
    currentUser,
    currentUserQuery.isFetching,
    currentUserQuery.isPending,
    userId,
    currentWorkspaceQuery.data?.workspaceId,
  ]);

  const refreshSession = useCallback(async () => {
    if (!configured) return;
    const result = await refetchCurrentUser();
    if (result.error) {
      console.error('[auth] failed to refresh session', result.error);
    }
  }, [configured, refetchCurrentUser]);

  const refreshCredits = useCallback(async () => {
    if (!userId) return;
    await queryClient.invalidateQueries({ queryKey: creditQueryKeys.all(userId) });
  }, [queryClient, userId]);

  useEffect(() => {
    if (creditBalanceQuery.error) {
      console.error('[auth] failed to load credit balance', creditBalanceQuery.error);
    }
  }, [creditBalanceQuery.error]);

  useEffect(() => {
    if (currentWorkspaceQuery.error) {
      console.error('[auth] failed to resolve workspace', currentWorkspaceQuery.error);
    }
  }, [currentWorkspaceQuery.error]);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      ...state,
      signInWithEmail: async (email: string, password: string) => {
        if (!client || !configured) {
          throw new Error(i18n.t('services.authConfigMissing'));
        }

        const result = await client.signIn.email({
          email,
          password,
        });
        if (result.error) {
          throw new Error(
            translateAuthError(result.error.message || '', 'header.auth.signInFailed'),
          );
        }

        await refreshSession();
      },
      signUpWithEmail: async (input: SignUpInput) => {
        if (!client || !configured) {
          throw new Error(i18n.t('services.authConfigMissing'));
        }

        const result = await client.signUp.email(
          {
            email: input.email,
            password: input.password,
            name: input.name,
            callbackURL: verifyEmailCallbackURL(),
          },
          {
            headers: {
              'x-turnstile-token': input.turnstileToken,
            },
          },
        );
        if (result.error) {
          throw new Error(
            translateAuthError(result.error.message || '', 'header.auth.signInFailed'),
          );
        }
      },
      updateUserName: async (name: string) => {
        if (!client || !configured) {
          throw new Error(i18n.t('services.authConfigMissing'));
        }

        const result = await client.updateUser({
          name,
        });
        if (result.error) {
          throw new Error(
            translateAuthError(result.error.message || '', 'settings.usernameFailed'),
          );
        }

        await refreshSession();
      },
      changePassword: async (currentPassword: string, newPassword: string) => {
        if (!client || !configured) {
          throw new Error(i18n.t('services.authConfigMissing'));
        }

        const result = await client.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        });
        if (result.error) {
          throw new Error(
            translateAuthError(result.error.message || '', 'settings.passwordFailed'),
          );
        }
      },
      requestPasswordReset: async (email: string) => {
        if (!client || !configured) {
          throw new Error(i18n.t('services.authConfigMissing'));
        }

        const result = await client.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/?auth_action=reset-password`,
        });
        if (result.error) {
          throw new Error(
            translateAuthError(result.error.message || '', 'header.auth.signInFailed'),
          );
        }
      },
      resetPassword: async (token: string, newPassword: string) => {
        if (!client || !configured) {
          throw new Error(i18n.t('services.authConfigMissing'));
        }

        const result = await client.resetPassword({
          token,
          newPassword,
        });
        if (result.error) {
          throw new Error(
            translateAuthError(result.error.message || '', 'header.auth.signInFailed'),
          );
        }
      },
      sendVerificationEmail: async (email: string) => {
        if (!client || !configured) {
          throw new Error(i18n.t('services.authConfigMissing'));
        }

        const result = await client.sendVerificationEmail({
          email,
          callbackURL: verifyEmailCallbackURL(),
        });
        if (result.error) {
          throw new Error(
            translateAuthError(result.error.message || '', 'header.auth.signInFailed'),
          );
        }
      },
      signOut: async () => {
        if (!client || !configured) {
          setAuthDialogOpen(false);
          return;
        }

        const scope =
          state.status === 'signed_in' && state.userId && state.workspaceId
            ? {
                kind: 'user' as const,
                userId: state.userId,
                workspaceId: state.workspaceId,
              }
            : null;
        const result = await client.signOut();
        if (result.error) {
          throw new Error(
            translateAuthError(result.error.message || '', 'header.auth.signOutFailed'),
          );
        }

        if (scope) {
          await clearLocalWorkspaceData(scope);
        }
        if (state.userId) {
          queryClient.removeQueries({ queryKey: creditQueryKeys.all(state.userId) });
          queryClient.removeQueries({ queryKey: workspaceQueryKeys.all(state.userId) });
          queryClient.removeQueries({ queryKey: workspaceMigrationQueryKeys.all(state.userId) });
        }
        queryClient.setQueryData(authQueryKeys.me, { signedIn: false, user: null });
        setAuthDialogOpen(false);
      },
      refreshSession,
      refreshCredits,
      openAuthDialog: () => setAuthDialogOpen(true),
      closeAuthDialog: () => setAuthDialogOpen(false),
    }),
    [client, configured, queryClient, refreshCredits, refreshSession, state],
  );

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('error')) {
      toast.error(i18n.t('header.auth.verifyEmailFailed'));
    }
  }, []);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export const useAuthSession = () => {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error('useAuthSession must be used within AuthSessionProvider');
  }
  return context;
};
