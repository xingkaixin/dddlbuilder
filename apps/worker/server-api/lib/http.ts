import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorCode, ApiErrorPayload, ApiMeta } from '@ddlbuilder/shared-types/api';
import type { ApiEnv } from './context.js';

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
  const requestId = getRequestId(c);
  const payload: ApiErrorPayload = {
    error,
    ...(code ? { code } : {}),
    ...(requestId ? { requestId } : {}),
  };
  return c.json(payload, status);
};

export type JsonBodyResult<T> =
  | { data: T; errorResponse: null }
  | { data: null; errorResponse: Response };

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
  const contentLength = Number(c.req.header('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      data: null,
      errorResponse: errorResponse(
        c,
        413,
        `Payload too large, maximum ${maxBytes} bytes`,
        'PAYLOAD_TOO_LARGE',
      ),
    };
  }

  const body = c.req.raw.body;
  if (!body) {
    return {
      data: null,
      errorResponse: errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON'),
    };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return {
          data: null,
          errorResponse: errorResponse(
            c,
            413,
            `Payload too large, maximum ${maxBytes} bytes`,
            'PAYLOAD_TOO_LARGE',
          ),
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      data: null,
      errorResponse: errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON'),
    };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const raw = new TextDecoder().decode(bytes);
    return { data: JSON.parse(raw) as T, errorResponse: null };
  } catch {
    return {
      data: null,
      errorResponse: errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON'),
    };
  }
};
