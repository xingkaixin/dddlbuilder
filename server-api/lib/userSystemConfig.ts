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

export type UserSystemConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseJwksUrl: string;
  turnstileSecretKey: string;
  signupBonusCredits: number;
};

export const getUserSystemConfig = (env: ApiEnv['Bindings']): UserSystemConfig => {
  if (!env.USER_DB) {
    throw new Error('USER_DB binding is required');
  }

  return {
    supabaseUrl: requireEnv(env.SUPABASE_URL, 'SUPABASE_URL'),
    supabaseAnonKey: requireEnv(env.SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY'),
    supabaseJwksUrl: requireEnv(env.SUPABASE_JWKS_URL, 'SUPABASE_JWKS_URL'),
    turnstileSecretKey: requireEnv(env.TURNSTILE_SECRET_KEY, 'TURNSTILE_SECRET_KEY'),
    signupBonusCredits: requirePositiveInt(env.SIGNUP_BONUS_CREDITS, 'SIGNUP_BONUS_CREDITS'),
  };
};
