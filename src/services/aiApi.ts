import i18n from '@/i18n';
import type { ApiErrorCode } from '@/types/api';

type ApiErrorPayload = {
  error?: string;
  code?: ApiErrorCode;
};

export const buildAuthenticatedJsonHeaders = (accessToken: string | null) => ({
  'Content-Type': 'application/json',
  ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
});

export const readAIErrorMessage = async (
  response: Response,
  fallbackKey: 'generationFailed' | 'reviewFailed' | 'explainFailed',
) => {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  const code = payload?.code;

  if (code === 'AUTH_REQUIRED' || code === 'INVALID_AUTH_TOKEN') {
    return i18n.t('services.authRequired');
  }
  if (code === 'CREDIT_EXHAUSTED') {
    return i18n.t('services.creditExhausted');
  }
  if (code === 'SERVICE_UNAVAILABLE' || code === 'UPSTREAM_OPENAI_ERROR') {
    return i18n.t('services.aiServiceUnavailable');
  }

  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  return response.status
    ? i18n.t('services.requestFailed', { status: response.status })
    : i18n.t(`services.${fallbackKey}`);
};
