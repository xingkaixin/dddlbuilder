import i18n from '@/i18n';

export type AuthError = {
  code?: string;
  status?: number;
};

const authErrorTranslationKeys: Record<string, string> = {
  EMAIL_NOT_VERIFIED: 'header.auth.emailNotVerified',
  INVALID_EMAIL: 'header.auth.invalidCredentials',
  INVALID_PASSWORD: 'header.auth.invalidCredentials',
  INVALID_EMAIL_OR_PASSWORD: 'header.auth.invalidCredentials',
  INVALID_USER: 'header.auth.invalidCredentials',
  USER_NOT_FOUND: 'header.auth.userNotFound',
  USER_EMAIL_NOT_FOUND: 'header.auth.userNotFound',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'header.auth.userNotFound',
  ACCOUNT_NOT_FOUND: 'header.auth.userNotFound',
  USER_ALREADY_EXISTS: 'header.auth.userAlreadyExists',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'header.auth.userAlreadyExists',
  INVALID_TOKEN: 'header.auth.resetTokenInvalid',
  TOKEN_EXPIRED: 'header.auth.resetTokenInvalid',
  PASSWORD_TOO_SHORT: 'header.auth.passwordTooShort',
  RATE_LIMIT_EXCEEDED: 'header.auth.tooManyRequests',
  USER_DISABLED: 'header.auth.accountDisabled',
};

export const translateAuthError = (error: AuthError | null, fallbackKey: string): string => {
  const translationKey =
    error?.status === 429
      ? 'header.auth.tooManyRequests'
      : error?.code
        ? authErrorTranslationKeys[error.code]
        : undefined;
  return i18n.t(translationKey ?? fallbackKey);
};
