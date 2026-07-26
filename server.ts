import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { applyCspHeaders } from './apps/worker/server-api/lib/csp';
import type { ApiEnv } from './apps/worker/server-api/lib/context';
import api from './apps/worker/api/index';

const app = new Hono<ApiEnv>();

// Local dev: bridge process.env to c.env so Hono routes can use c.env.VARIABLE_NAME
app.use('/api/*', async (c, next) => {
  // Only bridge if not already set (Workers runtime pre-populates c.env)
  if (!(c.env as any).OPENAI_API_KEY) {
    Object.assign(c.env as object, {
      CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      SUPABASE_JWKS_URL: process.env.SUPABASE_JWKS_URL,
      TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
      SIGNUP_BONUS_CREDITS: process.env.SIGNUP_BONUS_CREDITS,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL_NAME: process.env.OPENAI_MODEL_NAME,
      OPENAI_RATELIMIT_ENABLED: process.env.OPENAI_RATELIMIT_ENABLED,
      OPENAI_RATELIMIT_WINDOW_MS: process.env.OPENAI_RATELIMIT_WINDOW_MS,
      OPENAI_RATELIMIT_EXPLAIN_MAX: process.env.OPENAI_RATELIMIT_EXPLAIN_MAX,
      OPENAI_RATELIMIT_REVIEW_MAX: process.env.OPENAI_RATELIMIT_REVIEW_MAX,
      OPENAI_RATELIMIT_GENERATE_MAX: process.env.OPENAI_RATELIMIT_GENERATE_MAX,
      OPENAI_RETRY_MAX_ATTEMPTS: process.env.OPENAI_RETRY_MAX_ATTEMPTS,
      OPENAI_RETRY_BASE_DELAY_MS: process.env.OPENAI_RETRY_BASE_DELAY_MS,
      OPENAI_RETRY_MAX_DELAY_MS: process.env.OPENAI_RETRY_MAX_DELAY_MS,
      OPENAI_DAILY_BUDGET_ENABLED: process.env.OPENAI_DAILY_BUDGET_ENABLED,
      OPENAI_DAILY_BUDGET_MAX_TOKENS: process.env.OPENAI_DAILY_BUDGET_MAX_TOKENS,
      OPENAI_STREAM_DEBUG: process.env.OPENAI_STREAM_DEBUG,
      CSP_ENABLE: process.env.CSP_ENABLE,
      CSP_MODE: process.env.CSP_MODE,
      CSP_POLICY: process.env.CSP_POLICY,
      ADMIN_CONSOLE_PASSWORD: process.env.ADMIN_CONSOLE_PASSWORD,
    });
  }
  await next();
});

// Mount API routes
app.route('/', api);

// Keep docs base path canonical for VitePress
app.get('/docs', (c) => c.redirect('/docs/', 301));

app.use('/*', async (c, next) => {
  await next();
  applyCspHeaders(c);
});

// Serve built client assets.
app.use('/*', serveStatic({ root: './apps/web/dist/client' }));

// Fallback to index.html for SPA routing
app.get('*', serveStatic({ path: './apps/web/dist/client/index.html' }));

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port });
console.log(`🚀 Server running at http://localhost:${port}`);
