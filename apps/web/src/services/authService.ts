import { decodeApiError } from '@ddlbuilder/shared-types/api-contracts';
import { decodeMeResponse, type MeApiResponse } from '@ddlbuilder/shared-types/api';
import { ApiError } from '@/services/apiError';

export async function fetchCurrentUser(signal?: AbortSignal): Promise<MeApiResponse> {
  const response = await fetch('/api/me', {
    credentials: 'include',
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = decodeApiError(payload);
    throw new ApiError(error.error ?? 'Failed to load current user', response.status, error.code);
  }
  const decoded = decodeMeResponse(payload);
  if (decoded._tag === 'None') throw new Error('Invalid user response');
  return decoded.value;
}
