/// <reference types="@cloudflare/workers-types" />

export type ApiEnv = {
  Variables: {
    requestId: string;
  };
  Bindings: {
    ASSETS: { fetch: typeof fetch };
    SHARE_KV: KVNamespace;
    RATE_LIMIT_KV: KVNamespace;
    // Environment variables
    CORS_ALLOWED_ORIGINS?: string;
    OPENAI_RATELIMIT_STORE?: string;
    OPENAI_RATELIMIT_ENABLED?: string;
    OPENAI_RATELIMIT_WINDOW_MS?: string;
    OPENAI_RATELIMIT_EXPLAIN_MAX?: string;
    OPENAI_RATELIMIT_REVIEW_MAX?: string;
    OPENAI_RATELIMIT_GENERATE_MAX?: string;
    OPENAI_RETRY_MAX_ATTEMPTS?: string;
    OPENAI_RETRY_BASE_DELAY_MS?: string;
    OPENAI_RETRY_MAX_DELAY_MS?: string;
    OPENAI_DAILY_BUDGET_ENABLED?: string;
    OPENAI_DAILY_BUDGET_MAX_TOKENS?: string;
    OPENAI_STREAM_DEBUG?: string;
    OPENAI_API_KEY?: string;
    OPENAI_BASE_URL?: string;
    OPENAI_MODEL_NAME?: string;
    CSP_ENABLE?: string;
    CSP_MODE?: string;
    CSP_POLICY?: string;
  };
};
