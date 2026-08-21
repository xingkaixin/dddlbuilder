import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { applyCspHeaders } from '../server-api/lib/csp.js';
import type { ApiEnv } from '../server-api/lib/context.js';
import { withMeta } from '../server-api/lib/http.js';
import { registerParseSqlRoute } from '../server-api/routes/parseSql.js';
import { registerExplainRoute } from '../server-api/routes/explain.js';
import { registerReviewRoute } from '../server-api/routes/review.js';
import { registerGenerateTableRoute } from '../server-api/routes/generateTable.js';
import { registerGenerateCommentsRoute } from '../server-api/routes/generateComments.js';
import { registerIndexAdvisorRoute } from '../server-api/routes/indexAdvisor.js';
import { registerShareRoutes } from '../server-api/routes/share.js';
import { registerAuthRoutes } from '../server-api/routes/auth.js';
import { registerCreditRoutes } from '../server-api/routes/credits.js';
import { registerWorkspaceMigrationRoutes } from '../server-api/routes/workspaceMigration.js';
import { registerWorkspaceSnapshotRoutes } from '../server-api/routes/workspaceSnapshot.js';
import { registerWorkspaceRoutes } from '../server-api/routes/workspaces.js';
import { registerWorkspaceYDocRoutes } from '../server-api/routes/workspaceYDoc.js';
import { registerAdminRoutes } from '../server-api/routes/admin.js';
import { reclaimStaleAIUsage } from '../server-api/lib/aiUsage.js';
export { WorkspaceYDocDurableObject } from '../server-api/lib/workspaceYDocDurableObject.js';

const DOCS_DEV_ORIGIN = 'http://127.0.0.1:5174';
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1']);
const api = new Hono<ApiEnv>();
const app = new Hono<ApiEnv>();

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;

const parseAllowedOrigins = (envOrigins?: string): string[] => {
  const raw = envOrigins?.trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : DEFAULT_ALLOWED_ORIGINS;
};

const normalizeIncomingRequestId = (value: string | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!REQUEST_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
};

api.use('/*', async (c, next) => {
  const incoming = normalizeIncomingRequestId(c.req.header('x-request-id'));
  const requestId = incoming ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  await next();
});

api.use(
  '/*',
  cors({
    origin: (origin, c) => {
      const allowed = parseAllowedOrigins(c.env.CORS_ALLOWED_ORIGINS);
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Turnstile-Token'],
    credentials: true,
    exposeHeaders: [
      'X-Request-Id',
      'X-AI-Stream-Debug',
      'Retry-After',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Window-Ms',
      'X-Budget-Limit-Tokens',
      'X-Budget-Used-Tokens',
    ],
  }),
);

app.use('*', async (c, next) => {
  await next();
  applyCspHeaders(c);
});

api.get('/health', (c) => c.json(withMeta(c, { status: 'ok' })));

registerParseSqlRoute(api);
registerExplainRoute(api);
registerReviewRoute(api);
registerGenerateTableRoute(api);
registerGenerateCommentsRoute(api);
registerIndexAdvisorRoute(api);
registerShareRoutes(api);
registerAuthRoutes(api);
registerCreditRoutes(api);
registerWorkspaceMigrationRoutes(api);
registerWorkspaceSnapshotRoutes(api);
registerWorkspaceRoutes(api);
registerWorkspaceYDocRoutes(api);
registerAdminRoutes(api);

const isLocalDevRequest = (url: URL) => LOCAL_DEV_HOSTS.has(url.hostname);

const createProxyRequest = (targetUrl: URL, request: Request) =>
  new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });

app.route('/api', api);
app.get('/docs', (c) => c.redirect('/docs/', 301));
app.all('/docs/*', async (c) => {
  const currentUrl = new URL(c.req.url);
  if (!isLocalDevRequest(currentUrl)) {
    return c.env.ASSETS.fetch(c.req.raw);
  }

  const targetUrl = new URL(currentUrl.pathname + currentUrl.search, DOCS_DEV_ORIGIN);
  return fetch(createProxyRequest(targetUrl, c.req.raw));
});

// SPA fallback: non-API routes return index.html for client-side routing
app.get('*', async (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.notFound();
  }

  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.ok) return res;
  const indexRes = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  return new Response(indexRes.body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: ApiEnv['Bindings'], ctx: ExecutionContext) {
    ctx.waitUntil(
      reclaimStaleAIUsage(env).then(({ scanned, reclaimed }) => {
        if (scanned > 0) {
          console.log(`[ai-usage] reclaim scanned=${scanned} reclaimed=${reclaimed}`);
        }
      }),
    );
  },
};
