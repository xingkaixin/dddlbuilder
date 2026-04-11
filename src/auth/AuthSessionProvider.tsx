import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type PropsWithChildren,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import type { MeApiResponse } from '@/types/api';
import i18n from '@/i18n';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

export type UserSessionState = {
  status: 'loading' | 'signed_out' | 'signed_in';
  configured: boolean;
  accessToken: string | null;
  externalUserId: string | null;
  appUserId: string | null;
  email: string | null;
};

type AuthSessionContextValue = UserSessionState & {
  requestMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

const signedOutState = (configured: boolean): UserSessionState => ({
  status: 'signed_out',
  configured,
  accessToken: null,
  externalUserId: null,
  appUserId: null,
  email: null,
});

const fetchCurrentUser = async (accessToken: string): Promise<MeApiResponse> => {
  const response = await fetch('/api/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
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

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const configured = isSupabaseConfigured();
  const client = getSupabaseClient();
  const [state, setState] = useState<UserSessionState>({
    status: configured ? 'loading' : 'signed_out',
    configured,
    accessToken: null,
    externalUserId: null,
    appUserId: null,
    email: null,
  });
  const syncPromiseRef = useRef<Promise<void> | null>(null);

  const syncFromSession = useCallback(
    async (session: Session | null) => {
      if (!configured || !client || !session?.access_token || !session.user) {
        setState(signedOutState(configured));
        return;
      }

      const me = await fetchCurrentUser(session.access_token);
      if (!me.signedIn) {
        setState(signedOutState(configured));
        return;
      }

      setState({
        status: 'signed_in',
        configured,
        accessToken: session.access_token,
        externalUserId: me.user.externalUserId,
        appUserId: me.user.appUserId,
        email: me.user.email,
      });
    },
    [client, configured],
  );

  const refreshSession = useCallback(async () => {
    if (!configured || !client) {
      setState(signedOutState(configured));
      return;
    }

    if (syncPromiseRef.current) {
      return syncPromiseRef.current;
    }

    const task = (async () => {
      setState((prev) => ({ ...prev, status: 'loading' }));
      const { data, error } = await client.auth.getSession();
      if (error) {
        setState(signedOutState(configured));
        throw error;
      }
      await syncFromSession(data.session);
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
  }, [client, configured, syncFromSession]);

  useEffect(() => {
    if (!configured || !client) {
      setState(signedOutState(configured));
      return;
    }

    void refreshSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      void syncFromSession(session).catch((error) => {
        console.error('[auth] failed to sync auth state', error);
        toast.error(i18n.t('header.auth.signInFailed'));
        setState(signedOutState(configured));
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [client, configured, refreshSession, syncFromSession]);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      ...state,
      requestMagicLink: async (email: string) => {
        if (!client || !configured) {
          throw new Error(i18n.t('services.authConfigMissing'));
        }
        const redirectTo = window.location.origin;
        const { error } = await client.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: redirectTo,
          },
        });
        if (error) {
          throw error;
        }
      },
      signOut: async () => {
        if (!client || !configured) {
          setState(signedOutState(configured));
          return;
        }
        const { error } = await client.auth.signOut();
        if (error) {
          throw error;
        }
        setState(signedOutState(configured));
      },
      refreshSession,
    }),
    [client, configured, refreshSession, state],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export const useAuthSession = () => {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error('useAuthSession must be used within AuthSessionProvider');
  }
  return context;
};
