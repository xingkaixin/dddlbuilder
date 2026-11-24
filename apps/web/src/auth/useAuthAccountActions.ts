import { useMemo } from 'react';
import { i18n } from '@/i18n';
import { ApiError } from '@/services/apiError';
import { translateAuthError } from './authErrors';
import type { BetterAuthClient } from './betterAuthClient';

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
};

export type AuthAccountActions = {
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (input: SignUpInput) => Promise<'signed_in' | 'verification_required'>;
  updateUserName: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  sendVerificationEmail: (email: string) => Promise<void>;
  verifyEmail: (email: string, otp: string) => Promise<void>;
};

export const useAuthAccountActions = (
  loadClient: () => Promise<BetterAuthClient | null>,
  configured: boolean,
  refreshSession: () => Promise<void>,
): AuthAccountActions =>
  useMemo(() => {
    const requireClient = async () => {
      if (!configured) {
        throw new Error(i18n.t('services.authConfigMissing'));
      }

      const client = await loadClient();

      if (!client) {
        throw new Error(i18n.t('services.authConfigMissing'));
      }

      return client;
    };

    return {
      signInWithEmail: async (email, password) => {
        const result = await (await requireClient()).signIn.email({ email, password });

        if (result.error) {
          throw new ApiError(
            translateAuthError(result.error, 'header.auth.signInFailed'),
            result.error.status,
            result.error.code,
          );
        }

        await refreshSession();
      },
      signUpWithEmail: async (input) => {
        const result = await (await requireClient()).signUp.email(input);

        if (result.error) {
          throw new Error(translateAuthError(result.error, 'header.auth.signInFailed'));
        }

        if (result.data.token) {
          await refreshSession();

          return 'signed_in';
        }

        return 'verification_required';
      },
      updateUserName: async (name) => {
        const result = await (await requireClient()).updateUser({ name });

        if (result.error) {
          throw new Error(translateAuthError(result.error, 'settings.usernameFailed'));
        }

        await refreshSession();
      },
      changePassword: async (currentPassword, newPassword) => {
        const result = await (
          await requireClient()
        ).changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        });

        if (result.error) {
          throw new Error(translateAuthError(result.error, 'settings.passwordFailed'));
        }
      },
      requestPasswordReset: async (email) => {
        const result = await (
          await requireClient()
        ).requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/?auth_action=reset-password`,
        });

        if (result.error) {
          throw new Error(translateAuthError(result.error, 'header.auth.signInFailed'));
        }
      },
      resetPassword: async (token, newPassword) => {
        const result = await (await requireClient()).resetPassword({ token, newPassword });

        if (result.error) {
          throw new Error(translateAuthError(result.error, 'header.auth.signInFailed'));
        }
      },
      sendVerificationEmail: async (email) => {
        const result = await (await requireClient()).sendVerificationEmail({ email });

        if (result.error) {
          throw new Error(translateAuthError(result.error, 'header.auth.sendCodeFailed'));
        }
      },
      verifyEmail: async (email, otp) => {
        const result = await (await requireClient()).emailOtp.verifyEmail({ email, otp });

        if (result.error) {
          throw new Error(translateAuthError(result.error, 'header.auth.verifyCodeFailed'));
        }

        await refreshSession();
      },
    };
  }, [configured, loadClient, refreshSession]);
