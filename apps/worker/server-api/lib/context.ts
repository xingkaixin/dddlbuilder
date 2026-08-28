/// <reference types="@cloudflare/workers-types" />

export type ApiEnv = {
  Variables: {
    requestId: string;
    currentUserId?: string;
  };
  Bindings: {
    ASSETS: { fetch: typeof fetch };
    SHARE_KV: KVNamespace;
    USER_DB: D1Database;
    WORKSPACE_YDOC?: DurableObjectNamespace;
    // Environment variables
    CORS_ALLOWED_ORIGINS?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    AUTH_REQUIRE_EMAIL_VERIFICATION?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
    RESEND_FROM_NAME?: string;
    TURNSTILE_SECRET_KEY?: string;
    SIGNUP_BONUS_CREDITS?: string;
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
    OPENAI_REQUEST_TIMEOUT_MS?: string;
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
    ADMIN_SESSION_SECRET?: string;
  };
};

type EnvVariableKey = {
  [K in keyof ApiEnv['Bindings']]-?: ApiEnv['Bindings'][K] extends string | undefined ? K : never;
}[keyof ApiEnv['Bindings']];

export const ENV_VARIABLE_KEYS = [
  'CORS_ALLOWED_ORIGINS',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'AUTH_REQUIRE_EMAIL_VERIFICATION',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_FROM_NAME',
  'TURNSTILE_SECRET_KEY',
  'SIGNUP_BONUS_CREDITS',
  'OPENAI_RATELIMIT_ENABLED',
  'OPENAI_RATELIMIT_WINDOW_MS',
  'OPENAI_RATELIMIT_EXPLAIN_MAX',
  'OPENAI_RATELIMIT_REVIEW_MAX',
  'OPENAI_RATELIMIT_GENERATE_MAX',
  'OPENAI_RATELIMIT_GENERATE_COMMENTS_MAX',
  'OPENAI_RATELIMIT_INDEX_ADVISOR_MAX',
  'OPENAI_RETRY_MAX_ATTEMPTS',
  'OPENAI_RETRY_BASE_DELAY_MS',
  'OPENAI_RETRY_MAX_DELAY_MS',
  'OPENAI_REQUEST_TIMEOUT_MS',
  'OPENAI_DAILY_BUDGET_ENABLED',
  'OPENAI_DAILY_BUDGET_MAX_TOKENS',
  'OPENAI_STREAM_DEBUG',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL_NAME',
  'TELEGRAM_NOTIFY_ENABLED',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'CSP_ENABLE',
  'CSP_MODE',
  'CSP_POLICY',
  'ADMIN_CONSOLE_PASSWORD',
  'ADMIN_SESSION_SECRET',
] as const satisfies readonly EnvVariableKey[];

// 编译期断言：新增 Bindings 环境变量而未列入 ENV_VARIABLE_KEYS 时在此报错
// 编译期断言：新增 Bindings 环境变量而未列入 ENV_VARIABLE_KEYS 时在此报错
const _envKeysCovered: Exclude<EnvVariableKey, (typeof ENV_VARIABLE_KEYS)[number]> extends never
  ? true
  : never = true;
void _envKeysCovered;
