import {
  decodeApiError,
  decodeCreateShareResponse,
  decodeGetShareResponse,
  type CreateShareResponseSchema,
} from '@ddlbuilder/shared-types/api-contracts';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { decodePersistedState } from '@ddlbuilder/workspace-core';
import i18n from '@/i18n';
import { ApiError } from '@/services/apiError';

const SHARE_API_ENDPOINT = '/api/share';

export type CreateShareResponse = typeof CreateShareResponseSchema.Type;

export interface GetShareResponse {
  id: string;
  state: PersistedState;
}

export class ShareApiError extends ApiError {
  constructor(message: string, status: number, code?: string) {
    super(message, status, code);
    this.name = 'ShareApiError';
  }
}

async function parseError(response: Response): Promise<ShareApiError> {
  const payload = decodeApiError(await response.json().catch(() => null));
  const message = payload.error ?? i18n.t('services.requestFailed', { status: response.status });
  const code = payload.code;

  return new ShareApiError(message, response.status, code);
}

export async function createShare(state: PersistedState): Promise<CreateShareResponse> {
  const response = await fetch(SHARE_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ state }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = decodeCreateShareResponse(await response.json());

  if (data._tag === 'None') {
    throw new Error(i18n.t('services.shareResponseInvalid'));
  }

  return data.value;
}

export async function getShareState(shareId: string): Promise<PersistedState> {
  const response = await fetch(`${SHARE_API_ENDPOINT}/${encodeURIComponent(shareId)}`);

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = decodeGetShareResponse(await response.json());

  if (data._tag === 'None') {
    throw new Error(i18n.t('services.shareDataInvalid'));
  }

  // 分享内容存活于服务端 KV，升级后仍会读到迁移前写入的历史枚举值。
  const state = decodePersistedState(data.value.state, 'external');

  if (!state) throw new Error('Invalid shared state');

  return state;
}
