import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { toast } from 'sonner';
import type { MeApiResponse } from '@ddlbuilder/shared-types/api';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import i18n from '@/i18n';
import {
  clearLocalWorkspaceData,
  resolveDefaultWorkspaceScope,
} from '@/services/workspaceAccountService';
import { getBetterAuthClient, isBetterAuthConfigured } from './betterAuthClient';
import { getAnonymousWorkspaceScope, setCurrentWorkspaceScope } from '@/utils/workspaceScope';

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

export const fetchCurrentUser = async (): Promise<MeApiResponse> => {
  const response = await fetch('/api/me', {
    credentials: 'include',
  });

  const payload = (await response.json().catch(() => null)) as MeApiResponse | null;
  if (!response.ok) {
    throw new Error(
      payload && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Failed to load current user',
    );
  }

  if (!payload) {
    throw new Error('Empty user response');
  }

  return payload;
};

export const fetchCreditBalance = async (): Promise<number> => {
  const response = await fetch('/api/credits/balance', {
    credentials: 'include',
  });

  const payload = (await response.json().catch(() => null)) as {
    balance?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload.error === 'string'
        ? payload.error
        : 'Failed to load credit balance',
    );
  }

  return typeof payload?.balance === 'number' ? payload.balance : 0;
};

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const configured = isBetterAuthConfigured();
  const client = getBetterAuthClient();
  const [state, setState] = useState<UserSessionState>({
    status: configured ? 'loading' : 'signed_out',
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
  const syncPromiseRef = useRef<Promise<void> | null>(null);

  const syncSessionState = useCallback(async () => {
    if (!configured) {
      setState(signedOutState(false));
      return;
    }

    const me = await fetchCurrentUser();
    if (!me.signedIn) {
      setCurrentWorkspaceScope(getAnonymousWorkspaceScope());
      setState(signedOutState(true));
      return;
    }

    setState((prev) => ({
      ...prev,
      status: 'signed_in',
      configured: true,
      userId: me.user.userId,
      workspaceId: prev.userId === me.user.userId ? prev.workspaceId : null,
      email: me.user.email,
      name: me.user.name,
      emailVerified: me.user.emailVerified,
      creditsStatus: 'loading',
    }));

    const creditBalancePromise = fetchCreditBalance()
      .then((creditBalance) => {
        setState((prev) => ({
          ...prev,
          status: 'signed_in',
          configured: true,
          userId: me.user.userId,
          workspaceId: prev.workspaceId,
          email: me.user.email,
          name: me.user.name,
          emailVerified: me.user.emailVerified,
          creditBalance,
          creditsStatus: 'ready',
        }));
      })
      .catch((error) => {
        console.error('[auth] failed to load credit balance', error);
        setState((prev) => ({
          ...prev,
          status: 'signed_in',
          configured: true,
          userId: me.user.userId,
          workspaceId: prev.workspaceId,
          email: me.user.email,
          name: me.user.name,
          emailVerified: me.user.emailVerified,
          creditBalance: null,
          creditsStatus: 'error',
        }));
      });

    let workspaceScope: WorkspaceScope;
    try {
      workspaceScope = await resolveDefaultWorkspaceScope(me.user.userId);
    } catch (error) {
      console.error('[auth] failed to resolve workspace', error);
      setCurrentWorkspaceScope({ kind: 'user', userId: me.user.userId });
      await creditBalancePromise;
      return;
    }

    const workspaceId =
      workspaceScope.kind === 'user' ? (workspaceScope.workspaceId ?? null) : null;
    setCurrentWorkspaceScope(workspaceScope);
    if (workspaceId) {
      setState((prev) => ({ ...prev, workspaceId }));
    }
    await creditBalancePromise;
  }, [configured]);

  const refreshSession = useCallback(async () => {
    if (!configured) {
      setState(signedOutState(false));
      return;
    }

    if (syncPromiseRef.current) {
      return syncPromiseRef.current;
    }

    const task = (async () => {
      setState((prev) => ({ ...prev, status: 'loading' }));
      await syncSessionState();
    })()
      .catch((error) => {
        console.error('[auth] failed to refresh session', error);
        setState(signedOutState(configured));
      })
      .finally(() => {
        syncPromiseRef.current = null;
      });

    syncPromiseRef.current = task;
    return task;
  }, [configured, syncSessionState]);

  useEffect(() => {
    if (!configured) {
      setState(signedOutState(false));
      return;
    }

    void refreshSession();
  }, [configured, refreshSession]);

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
          setState(signedOutState(configured));
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
        setCurrentWorkspaceScope(getAnonymousWorkspaceScope());
        setState(signedOutState(configured));
      },
      refreshSession,
      refreshCredits: async () => {
        if (state.status !== 'signed_in' || !state.userId) {
          setState((prev) => ({ ...prev, creditBalance: null, creditsStatus: 'idle' }));
          return;
        }

        setState((prev) => ({ ...prev, creditsStatus: 'loading' }));
        try {
          const creditBalance = await fetchCreditBalance();
          setState((prev) => ({
            ...prev,
            creditBalance,
            creditsStatus: 'ready',
          }));
        } catch (error) {
          console.error('[auth] failed to refresh credits', error);
          setState((prev) => ({
            ...prev,
            creditBalance: null,
            creditsStatus: 'error',
          }));
        }
      },
      openAuthDialog: () => {
        setState((prev) => ({ ...prev, authDialogOpen: true }));
      },
      closeAuthDialog: () => {
        setState((prev) => ({ ...prev, authDialogOpen: false }));
      },
    }),
    [client, configured, refreshSession, state],
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
