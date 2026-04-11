export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_AUTH_TOKEN'
  | 'USER_DISABLED'
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
  | 'DDL_REQUIRED'
  | 'REDIS_CONFIG_MISSING'
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

export type MeApiResponse =
  | {
      signedIn: false;
      user: null;
      meta?: ApiMeta;
    }
  | {
      signedIn: true;
      user: {
        appUserId: string;
        externalUserId: string;
        email: string;
      };
      meta?: ApiMeta;
    };
