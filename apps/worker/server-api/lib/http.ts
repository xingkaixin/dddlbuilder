import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorCode, ApiErrorPayload, ApiMeta } from '@ddlbuilder/shared-types/api';
import type { ApiEnv } from './context.js';
import { getRequestLogger } from './logging.js';

export type { ApiErrorCode, ApiErrorPayload, ApiMeta } from '@ddlbuilder/shared-types/api';

const REQUEST_ID_CONTEXT_KEY = 'requestId';

export const getRequestId = (c: Context<ApiEnv>): string | undefined => {
  const value = c.get(REQUEST_ID_CONTEXT_KEY) as unknown;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

export const withMeta = <T extends object>(
  c: Context<ApiEnv>,
  payload: T,
): T & { meta?: ApiMeta } => {
  const requestId = getRequestId(c);
  if (!requestId) return payload;
  return {
    ...payload,
    meta: {
      requestId,
    },
  };
};

export const errorResponse = (
  c: Context<ApiEnv>,
  status: ContentfulStatusCode,
  error: string,
  code?: ApiErrorCode,
) => {
  if (code) getRequestLogger(c)?.set({ outcome: { errorCode: code } });
  const requestId = getRequestId(c);
  const payload: ApiErrorPayload = {
    error,
    ...(code ? { code } : {}),
    ...(requestId ? { requestId } : {}),
  };
  return c.json(payload, status);
};

export type JsonBodyResult<T> = { ok: true; data: T } | { ok: false; response: Response };

type BodyValidationResult = { ok: true } | { ok: false; response: Response };

type BodyReadResult =
  | { ok: true; bytes: Uint8Array | null }
  | { ok: false; reason: 'invalid' | 'too_large' };

const readBodyWithLimit = async (request: Request, maxBytes: number): Promise<BodyReadResult> => {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, reason: 'too_large' };
  }

  if (!request.body) return { ok: true, bytes: null };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
};

const payloadTooLargeResponse = (c: Context<ApiEnv>, maxBytes: number) =>
  errorResponse(c, 413, `Payload too large, maximum ${maxBytes} bytes`, 'PAYLOAD_TOO_LARGE');

export const validateRequestBodyWithLimit = async (
  c: Context<ApiEnv>,
  maxBytes: number,
): Promise<BodyValidationResult> => {
  const result = await readBodyWithLimit(c.req.raw.clone(), maxBytes);
  if (!result.ok) {
    return {
      ok: false,
      response:
        result.reason === 'too_large'
          ? payloadTooLargeResponse(c, maxBytes)
          : errorResponse(c, 400, 'Invalid request body'),
    };
  }
  return { ok: true };
};

/**
 * 领域层用错误表达可预期的失败，全局 onError 负责渲染成响应；
 * status 和 code 在抛出点确定，路由层不再各自翻译错误字符串。
 */
export class DomainError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ApiErrorCode;

  constructor(status: ContentfulStatusCode, code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
    this.code = code;
  }
}

export const parseJsonBodyWithLimit = async <T>(
  c: Context<ApiEnv>,
  maxBytes: number,
): Promise<JsonBodyResult<T>> => {
  const result = await readBodyWithLimit(c.req.raw, maxBytes);
  if (!result.ok) {
    return {
      ok: false,
      response:
        result.reason === 'too_large'
          ? payloadTooLargeResponse(c, maxBytes)
          : errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON'),
    };
  }

  if (!result.bytes) {
    return {
      ok: false,
      response: errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON'),
    };
  }

  try {
    const raw = new TextDecoder().decode(result.bytes);
    return { ok: true, data: JSON.parse(raw) as T };
  } catch {
    return {
      ok: false,
      response: errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON'),
    };
  }
};
