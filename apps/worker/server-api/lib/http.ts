import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiEnv } from './context.js';

export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_AUTH_TOKEN'
  | 'USER_DISABLED'
  | 'CREDIT_EXHAUSTED'
  | 'TURNSTILE_REQUIRED'
  | 'TURNSTILE_FAILED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_JSON'
  | 'SQL_REQUIRED'
  | 'SQL_TOO_LONG'
  | 'INVALID_DATABASE_TYPE'
  | 'SQL_PARSE_FAILED'
  | 'OPENAI_API_KEY_MISSING'
  | 'EXPLAIN_FAILED'
  | 'REVIEW_FAILED'
  | 'GENERATION_FAILED'
  | 'DESCRIPTION_REQUIRED'
  | 'SCHEMA_REQUIRED'
  | 'DDL_REQUIRED'
  | 'REDIS_CONFIG_MISSING'
  | 'KV_CONFIG_MISSING'
  | 'SHARE_STATE_REQUIRED'
  | 'SHARE_STATE_INVALID'
  | 'SHARE_UUID_INVALID'
  | 'SHARE_NOT_FOUND'
  | 'SHARE_STORE_FAILED'
  | 'SHARE_LOAD_FAILED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'BUDGET_EXCEEDED'
  | 'UPSTREAM_OPENAI_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'ADMIN_REQUIRED';

export type ApiMeta = {
  requestId?: string;
};

export type ApiErrorPayload = {
  error: string;
  code?: ApiErrorCode;
  requestId?: string;
};

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

export const streamErrorPayload = (error: string, code?: ApiErrorCode, requestId?: string) =>
  JSON.stringify({
    error,
    ...(code ? { code } : {}),
    ...(requestId ? { requestId } : {}),
  } satisfies ApiErrorPayload);

export const parseJsonBodyWithLimit = async <T>(
  c: Context<ApiEnv>,
  maxBytes: number,
): Promise<{ data: T | null; errorResponse: Response | null }> => {
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
