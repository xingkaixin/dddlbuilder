import i18n from '@/i18n';
import type { ApiErrorCode } from '@ddlbuilder/shared-types/api';

type ApiErrorPayload = {
  error?: string;
  code?: ApiErrorCode;
};

export const buildAuthenticatedJsonHeaders = () => ({
  'Content-Type': 'application/json',
});

export const getAIErrorMessage = (payload: ApiErrorPayload | null): string | null => {
  const code = payload?.code;

  if (code === 'AUTH_REQUIRED' || code === 'INVALID_AUTH_TOKEN') {
    return i18n.t('services.authRequired');
  }
  if (code === 'CREDIT_EXHAUSTED') {
    return i18n.t('services.creditExhausted');
  }
  if (code === 'AI_OUTPUT_TRUNCATED') {
    return i18n.t('services.aiOutputTruncated');
  }
  if (code === 'SERVICE_UNAVAILABLE' || code === 'UPSTREAM_OPENAI_ERROR') {
    return i18n.t('services.aiServiceUnavailable');
  }

  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  return null;
};

export const readAIErrorMessage = async (
  response: Response,
  fallbackKey: 'generationFailed' | 'reviewFailed' | 'explainFailed',
) => {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  return (
    getAIErrorMessage(payload) ??
    (response.status
      ? i18n.t('services.requestFailed', { status: response.status })
      : i18n.t(`services.${fallbackKey}`))
  );
};
