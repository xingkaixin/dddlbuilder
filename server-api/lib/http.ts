import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiEnv } from './context.js';

export type ApiErrorCode =
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
  | 'SERVICE_UNAVAILABLE';

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
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
};

export const withMeta = <T extends Record<string, unknown>>(
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

export const streamErrorPayload = (
  error: string,
  code?: ApiErrorCode,
  requestId?: string,
) =>
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
  if (!Number.isNaN(contentLength) && contentLength > maxBytes) {
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

  let raw = '';
  try {
    raw = await c.req.text();
  } catch {
    return {
      data: null,
      errorResponse: errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON'),
    };
  }

  if (new TextEncoder().encode(raw).length > maxBytes) {
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

  try {
    return { data: JSON.parse(raw) as T, errorResponse: null };
  } catch {
    return {
      data: null,
      errorResponse: errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON'),
    };
  }
};
