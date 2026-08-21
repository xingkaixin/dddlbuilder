import type { MeApiResponse } from '@ddlbuilder/shared-types/api';
import { ApiError } from '@/services/apiError';

export async function fetchCurrentUser(signal?: AbortSignal): Promise<MeApiResponse> {
  const response = await fetch('/api/me', {
    credentials: 'include',
    signal,
  });
  const payload = (await response.json().catch(() => null)) as MeApiResponse | null;
  if (!response.ok) {
    const message =
      payload && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Failed to load current user';
    throw new ApiError(message, response.status);
  }
  if (!payload) throw new Error('Empty user response');
  return payload;
}
