import type { ApiEnv } from './context.js';

const requireEnv = (value: string | undefined, key: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${key} is required`);
  }
  return normalized;
};

const requirePositiveInt = (value: string | undefined, key: string): number => {
  const normalized = requireEnv(value, key);
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
};

const readEmailVerificationRequirement = (value: string | undefined): boolean => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error('AUTH_REQUIRE_EMAIL_VERIFICATION must be true or false');
};

export type UserSystemConfig = {
  betterAuthSecret: string;
  betterAuthUrl: string;
  authRequireEmailVerification: boolean;
  resendApiKey: string;
  resendFromEmail: string;
  resendFromName: string;
  turnstileSecretKey: string;
  signupBonusCredits: number;
};

export const getUserSystemConfig = (env: ApiEnv['Bindings']): UserSystemConfig => {
  if (!env.USER_DB) {
    throw new Error('USER_DB binding is required');
  }

  return {
    betterAuthSecret: requireEnv(env.BETTER_AUTH_SECRET, 'BETTER_AUTH_SECRET'),
    betterAuthUrl: requireEnv(env.BETTER_AUTH_URL, 'BETTER_AUTH_URL'),
    authRequireEmailVerification: readEmailVerificationRequirement(
      env.AUTH_REQUIRE_EMAIL_VERIFICATION,
    ),
    resendApiKey: requireEnv(env.RESEND_API_KEY, 'RESEND_API_KEY'),
    resendFromEmail: requireEnv(env.RESEND_FROM_EMAIL, 'RESEND_FROM_EMAIL'),
    resendFromName: env.RESEND_FROM_NAME?.trim() || 'DDLBuilder',
    turnstileSecretKey: requireEnv(env.TURNSTILE_SECRET_KEY, 'TURNSTILE_SECRET_KEY'),
    signupBonusCredits: requirePositiveInt(env.SIGNUP_BONUS_CREDITS, 'SIGNUP_BONUS_CREDITS'),
  };
};
