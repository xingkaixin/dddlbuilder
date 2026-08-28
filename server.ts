import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { applyCspHeaders } from './apps/worker/server-api/lib/csp';
import { ENV_VARIABLE_KEYS, type ApiEnv } from './apps/worker/server-api/lib/context';
import { apiRouter } from './apps/worker/api/index';

const app = new Hono<ApiEnv>();

// Local dev: bridge process.env to c.env so Hono routes can use c.env.VARIABLE_NAME
app.use('/api/*', async (c, next) => {
  // Only bridge if not already set (Workers runtime pre-populates c.env)
  if (!c.env.OPENAI_API_KEY) {
    Object.assign(
      c.env,
      Object.fromEntries(ENV_VARIABLE_KEYS.map((key) => [key, process.env[key]])),
    );
  }
  await next();
});

// Mount API routes
app.route('/api', apiRouter);

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
