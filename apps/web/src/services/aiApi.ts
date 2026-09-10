import i18n from '@/i18n';
import { decodeApiError } from '@ddlbuilder/shared-types/api-contracts';

type ApiErrorPayload = {
  error?: string;
  code?: string;
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

  const error = payload?.error;

  if (error?.trim()) {
    return error;
  }

  return null;
};

export const readAIErrorMessage = async (
  response: Response,
  fallbackKey: 'generationFailed' | 'reviewFailed' | 'explainFailed',
) => {
  const payload: ApiErrorPayload = decodeApiError(await response.json().catch(() => null));

  return (
    getAIErrorMessage(payload) ??
    (response.status
      ? i18n.t('services.requestFailed', { status: response.status })
      : i18n.t(`services.${fallbackKey}`))
  );
};
