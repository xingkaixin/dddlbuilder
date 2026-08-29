import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import type { UserWorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import {
  readWorkspaceIdentity,
  parseWorkspaceIdentity,
  subscribeWorkspaceIdentity,
  writeWorkspaceIdentity,
  WORKSPACE_IDENTITY_KEY,
} from '@/services/workspaceIdentity';
import { currentUserOptions, authQueryKeys } from '@/queries/auth';
import { creditBalanceOptions, creditQueryKeys } from '@/queries/credits';
import { currentWorkspaceOptions, workspaceQueryKeys } from '@/queries/workspaces';
import { fetchCurrentUser } from '@/services/authService';
import { fetchCreditBalance } from '@/services/creditService';
import { getBetterAuthClient, isBetterAuthConfigured } from './betterAuthClient';
import { translateAuthError } from './authErrors';
import { useAuthAccountActions, type AuthAccountActions } from './useAuthAccountActions';
import { executeWorkspaceSignOut } from './workspaceSignOut';

export { fetchCurrentUser, fetchCreditBalance };
export { translateAuthError } from './authErrors';

export type AuthIdentityState = {
  status: 'loading' | 'signed_out' | 'signed_in';
  configured: boolean;
  userId: string | null;
  workspaceId: string | null;
  workspaceScope: UserWorkspaceScope | null;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
};

export type AuthCreditsState = {
  creditBalance: number | null;
  creditsStatus: 'idle' | 'loading' | 'ready' | 'error';
};

export type AuthDialogState = {
  authDialogOpen: boolean;
};

export type AuthActions = AuthAccountActions & {
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

export type AuthCreditsContextValue = AuthCreditsState & {
  refreshCredits: () => Promise<void>;
};

export type AuthDialogContextValue = AuthDialogState & {
  openAuthDialog: () => void;
  closeAuthDialog: () => void;
};

const AuthIdentityContext = createContext<AuthIdentityState | null>(null);
const AuthActionsContext = createContext<AuthActions | null>(null);
const AuthCreditsContext = createContext<AuthCreditsContextValue | null>(null);
const AuthDialogContext = createContext<AuthDialogContextValue | null>(null);

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const configured = isBetterAuthConfigured();
  const client = getBetterAuthClient();
  const queryClient = useQueryClient();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const storedIdentity = useSyncExternalStore(subscribeWorkspaceIdentity, readWorkspaceIdentity);
  const localWorkspace = useMemo(() => parseWorkspaceIdentity(storedIdentity), [storedIdentity]);
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
  const workspaceId =
    currentWorkspaceQuery.data?.workspaceId ??
    (userId === localWorkspace?.userId ? localWorkspace.workspaceId : null);
  const scopeUserId = userId ?? localWorkspace?.userId ?? null;
  const scopeWorkspaceId = userId ? workspaceId : (localWorkspace?.workspaceId ?? null);
  const workspaceScope = useMemo<UserWorkspaceScope | null>(
    () =>
      scopeUserId && scopeWorkspaceId
        ? { kind: 'user', userId: scopeUserId, workspaceId: scopeWorkspaceId }
        : null,
    [scopeUserId, scopeWorkspaceId],
  );

  useEffect(() => {
    if (userId && currentWorkspaceQuery.data?.workspaceId && !signingOut) {
      writeWorkspaceIdentity({
        kind: 'user',
        userId,
        workspaceId: currentWorkspaceQuery.data.workspaceId,
      });
    }
  }, [currentWorkspaceQuery.data?.workspaceId, signingOut, userId]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== WORKSPACE_IDENTITY_KEY && event.key !== null) return;
      if (!event.newValue) {
        void queryClient.cancelQueries({ queryKey: authQueryKeys.me });
        queryClient.setQueryData(authQueryKeys.me, { signedIn: false, user: null });
      } else {
        void queryClient.resetQueries({ queryKey: authQueryKeys.me });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [queryClient]);
  const refetchCurrentUser = currentUserQuery.refetch;
  const identity = useMemo<AuthIdentityState>(() => {
    if (!configured) {
      return {
        status: 'signed_out',
        configured: false,
        userId: null,
        workspaceId: null,
        workspaceScope: null,
        email: null,
        name: null,
        emailVerified: false,
      };
    }
    const status = currentUser
      ? 'signed_in'
      : currentUserQuery.isPending
        ? 'loading'
        : 'signed_out';
    return {
      status,
      configured: true,
      userId,
      workspaceId,
      workspaceScope,
      email: currentUser?.email ?? null,
      name: currentUser?.name ?? null,
      emailVerified: currentUser?.emailVerified ?? false,
    };
  }, [configured, currentUser, currentUserQuery.isPending, userId, workspaceId, workspaceScope]);
  const credits = useMemo<AuthCreditsState>(
    () => ({
      creditBalance: creditBalanceQuery.data ?? null,
      creditsStatus: !userId
        ? 'idle'
        : creditBalanceQuery.isPending
          ? 'loading'
          : creditBalanceQuery.isError
            ? 'error'
            : 'ready',
    }),
    [creditBalanceQuery.data, creditBalanceQuery.isError, creditBalanceQuery.isPending, userId],
  );

  const refreshSession = useCallback(async () => {
    if (!configured) return;
    const result = await refetchCurrentUser();
    if (result.error) {
      console.error('[auth] failed to refresh session', result.error);
      return;
    }
    if (result.data?.signedIn) {
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.current(result.data.user.userId),
      });
    }
  }, [configured, queryClient, refetchCurrentUser]);

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

  const accountActions = useAuthAccountActions(client, configured, refreshSession);
  const signOut = useCallback(async () => {
    if (signingOut) return;
    if (!client || !configured) {
      setAuthDialogOpen(false);
      return;
    }

    const scope =
      identity.status === 'signed_in' && identity.userId && identity.workspaceId
        ? {
            kind: 'user' as const,
            userId: identity.userId,
            workspaceId: identity.workspaceId,
          }
        : null;
    setSigningOut(true);
    try {
      await executeWorkspaceSignOut({
        scope,
        userId: identity.userId,
        queryClient,
        remoteSignOut: async () => {
          const result = await client.signOut();
          if (result.error) {
            throw new Error(translateAuthError(result.error, 'header.auth.signOutFailed'));
          }
        },
      });
      setAuthDialogOpen(false);
    } finally {
      setSigningOut(false);
    }
  }, [client, configured, identity, queryClient, signingOut]);
  const actions = useMemo<AuthActions>(
    () => ({ ...accountActions, signOut, refreshSession }),
    [accountActions, refreshSession, signOut],
  );
  const creditContext = useMemo<AuthCreditsContextValue>(
    () => ({ ...credits, refreshCredits }),
    [credits, refreshCredits],
  );
  const dialog = useMemo<AuthDialogContextValue>(
    () => ({
      authDialogOpen,
      openAuthDialog: () => setAuthDialogOpen(true),
      closeAuthDialog: () => setAuthDialogOpen(false),
    }),
    [authDialogOpen],
  );

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('error')) {
      toast.error(i18n.t('header.auth.verifyEmailFailed'));
    }
  }, []);

  return (
    <AuthIdentityContext.Provider value={identity}>
      <AuthActionsContext.Provider value={actions}>
        <AuthCreditsContext.Provider value={creditContext}>
          <AuthDialogContext.Provider value={dialog}>
            <div className="contents" inert={signingOut} aria-busy={signingOut}>
              {children}
            </div>
            {signingOut && (
              <div
                role="status"
                className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border bg-background px-4 py-2 text-sm text-foreground shadow-sm"
              >
                {i18n.t('workspaceYDoc.signOut.saving')}
              </div>
            )}
          </AuthDialogContext.Provider>
        </AuthCreditsContext.Provider>
      </AuthActionsContext.Provider>
    </AuthIdentityContext.Provider>
  );
}

export const useAuthIdentity = () => {
  const value = useContext(AuthIdentityContext);
  if (!value) throw new Error('useAuthIdentity must be used within AuthSessionProvider');
  return value;
};

export const useAuthActions = () => {
  const value = useContext(AuthActionsContext);
  if (!value) throw new Error('useAuthActions must be used within AuthSessionProvider');
  return value;
};

export const useAuthCredits = () => {
  const value = useContext(AuthCreditsContext);
  if (!value) throw new Error('useAuthCredits must be used within AuthSessionProvider');
  return value;
};

export const useAuthDialog = () => {
  const value = useContext(AuthDialogContext);
  if (!value) throw new Error('useAuthDialog must be used within AuthSessionProvider');
  return value;
};
