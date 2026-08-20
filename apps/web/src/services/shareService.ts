import { type PersistedState, normalizePersistedRows } from '@ddlbuilder/shared-types';
import i18n from '@/i18n';

const SHARE_API_ENDPOINT = '/api/share';

interface ApiErrorPayload {
  error?: string;
  code?: string;
}

export interface CreateShareResponse {
  id: string;
  url: string;
  expiresInSeconds: number;
}

export interface GetShareResponse {
  id: string;
  state: PersistedState;
}

export class ShareApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ShareApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseError(response: Response): Promise<ShareApiError> {
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
  const message =
    typeof payload.error === 'string'
      ? payload.error
      : i18n.t('services.requestFailed', { status: response.status });
  const code = typeof payload.code === 'string' ? payload.code : undefined;
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

  const data = (await response.json()) as Partial<CreateShareResponse>;

  if (
    typeof data.id !== 'string' ||
    typeof data.url !== 'string' ||
    typeof data.expiresInSeconds !== 'number'
  ) {
    throw new Error(i18n.t('services.shareResponseInvalid'));
  }

  return {
    id: data.id,
    url: data.url,
    expiresInSeconds: data.expiresInSeconds,
  };
}

export async function getShareState(shareId: string): Promise<PersistedState> {
  const response = await fetch(`${SHARE_API_ENDPOINT}/${encodeURIComponent(shareId)}`);

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as Partial<GetShareResponse>;
  if (!data.state || typeof data.state !== 'object') {
    throw new Error(i18n.t('services.shareDataInvalid'));
  }

  // 分享内容存活于服务端 KV，升级后仍会读到迁移前写入的历史枚举值。
  return normalizePersistedRows(data.state as PersistedState);
}
