import type { Context } from 'hono';

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
  | 'SHARE_STATE_REQUIRED'
  | 'SHARE_STATE_INVALID'
  | 'SHARE_UUID_INVALID'
  | 'SHARE_NOT_FOUND'
  | 'SHARE_STORE_FAILED'
  | 'SHARE_LOAD_FAILED';

export const errorResponse = (
  c: Context,
  status: number,
  error: string,
  code?: ApiErrorCode,
) => c.json(code ? { error, code } : { error }, status);

export const streamErrorPayload = (error: string, code?: ApiErrorCode) =>
  JSON.stringify(code ? { error, code } : { error });

export const parseJsonBodyWithLimit = async <T>(
  c: Context,
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
