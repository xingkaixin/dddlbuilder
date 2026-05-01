/// <reference types="@cloudflare/workers-types" />

export type ApiEnv = {
  Variables: {
    requestId: string;
    currentUserId?: string;
  };
  Bindings: {
    ASSETS: { fetch: typeof fetch };
    SHARE_KV: KVNamespace;
    RATE_LIMIT_KV: KVNamespace;
    USER_DB: D1Database;
    // Environment variables
    CORS_ALLOWED_ORIGINS?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
    RESEND_FROM_NAME?: string;
    TURNSTILE_SECRET_KEY?: string;
    SIGNUP_BONUS_CREDITS?: string;
    OPENAI_RATELIMIT_STORE?: string;
    OPENAI_RATELIMIT_ENABLED?: string;
    OPENAI_RATELIMIT_WINDOW_MS?: string;
    OPENAI_RATELIMIT_EXPLAIN_MAX?: string;
    OPENAI_RATELIMIT_REVIEW_MAX?: string;
    OPENAI_RATELIMIT_GENERATE_MAX?: string;
    OPENAI_RATELIMIT_GENERATE_COMMENTS_MAX?: string;
    OPENAI_RATELIMIT_INDEX_ADVISOR_MAX?: string;
    OPENAI_RETRY_MAX_ATTEMPTS?: string;
    OPENAI_RETRY_BASE_DELAY_MS?: string;
    OPENAI_RETRY_MAX_DELAY_MS?: string;
    OPENAI_DAILY_BUDGET_ENABLED?: string;
    OPENAI_DAILY_BUDGET_MAX_TOKENS?: string;
    OPENAI_STREAM_DEBUG?: string;
    OPENAI_API_KEY?: string;
    OPENAI_BASE_URL?: string;
    OPENAI_MODEL_NAME?: string;
    TELEGRAM_NOTIFY_ENABLED?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
    CSP_ENABLE?: string;
    CSP_MODE?: string;
    CSP_POLICY?: string;
    ADMIN_CONSOLE_PASSWORD?: string;
  };
};
