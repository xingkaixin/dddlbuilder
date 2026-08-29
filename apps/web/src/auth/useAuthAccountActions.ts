import { useMemo } from 'react';
import i18n from '@/i18n';
import { translateAuthError } from './authErrors';
import type { getBetterAuthClient } from './betterAuthClient';

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
  turnstileToken: string;
};

export type AuthAccountActions = {
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (input: SignUpInput) => Promise<void>;
  updateUserName: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  sendVerificationEmail: (email: string) => Promise<void>;
};

type AuthClient = ReturnType<typeof getBetterAuthClient>;

const verifyEmailCallbackURL = () => `${window.location.origin}/?auth_action=verify-email`;

export const useAuthAccountActions = (
  client: AuthClient,
  configured: boolean,
  refreshSession: () => Promise<void>,
): AuthAccountActions =>
  useMemo(() => {
    const requireClient = () => {
      if (!client || !configured) {
        throw new Error(i18n.t('services.authConfigMissing'));
      }
      return client;
    };

    return {
      signInWithEmail: async (email, password) => {
        const result = await requireClient().signIn.email({ email, password });
        if (result.error) {
          throw new Error(translateAuthError(result.error, 'header.auth.signInFailed'));
        }
        await refreshSession();
      },
      signUpWithEmail: async (input) => {
        const result = await requireClient().signUp.email(
          {
            email: input.email,
            password: input.password,
            name: input.name,
            callbackURL: verifyEmailCallbackURL(),
          },
          { headers: { 'x-turnstile-token': input.turnstileToken } },
        );
        if (result.error) {
          throw new Error(translateAuthError(result.error, 'header.auth.signInFailed'));
        }
      },
      updateUserName: async (name) => {
        const result = await requireClient().updateUser({ name });
        if (result.error) {
          throw new Error(translateAuthError(result.error, 'settings.usernameFailed'));
        }
        await refreshSession();
      },
      changePassword: async (currentPassword, newPassword) => {
        const result = await requireClient().changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        });
        if (result.error) {
          throw new Error(translateAuthError(result.error, 'settings.passwordFailed'));
        }
      },
      requestPasswordReset: async (email) => {
        const result = await requireClient().requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/?auth_action=reset-password`,
        });
        if (result.error) {
          throw new Error(translateAuthError(result.error, 'header.auth.signInFailed'));
        }
      },
      resetPassword: async (token, newPassword) => {
        const result = await requireClient().resetPassword({ token, newPassword });
        if (result.error) {
          throw new Error(translateAuthError(result.error, 'header.auth.signInFailed'));
        }
      },
      sendVerificationEmail: async (email) => {
        const result = await requireClient().sendVerificationEmail({
          email,
          callbackURL: verifyEmailCallbackURL(),
        });
        if (result.error) {
          throw new Error(translateAuthError(result.error, 'header.auth.signInFailed'));
        }
      },
    };
  }, [client, configured, refreshSession]);
