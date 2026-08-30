import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { applyCspHeaders } from '../server-api/lib/csp.js';
import type { ApiEnv } from '../server-api/lib/context.js';
import { DomainError, errorResponse, withMeta } from '../server-api/lib/http.js';
import { parseAllowedOrigins } from '../server-api/lib/env.js';
import {
  completeRequestLogContext,
  createWorkerBackgroundLogger,
  getRequestLogger,
  normalizeIncomingRequestId,
  toWorkerError,
  withWorkerRequestLogging,
} from '../server-api/lib/logging.js';
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
import { registerWorkspaceRoutes } from '../server-api/routes/workspaces.js';
import { registerWorkspaceYDocRoutes } from '../server-api/routes/workspaceYDoc.js';
import { registerAdminRoutes } from '../server-api/routes/admin.js';
import { reclaimStaleAIUsage } from '../server-api/lib/aiUsage.js';
import { cleanupAIGovernance, reconcileTerminalAIBudgets } from '../server-api/lib/aiBudget.js';
export { WorkspaceYDocDurableObject } from '../server-api/lib/workspaceYDocDurableObject.js';

const DOCS_DEV_ORIGIN = 'http://127.0.0.1:5174';
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1']);
const api = new Hono<ApiEnv>();
const app = new Hono<ApiEnv>();

export { api as apiRouter };

api.use('/*', async (c, next) => {
  const incoming = normalizeIncomingRequestId(c.req.header('x-request-id'));
  const requestId = incoming ?? crypto.randomUUID();
  c.set('requestId', requestId);
  if (c.env.EVLOG_REQUEST_LOG) c.set('log', c.env.EVLOG_REQUEST_LOG);
  c.header('X-Request-Id', requestId);
  try {
    await next();
  } finally {
    completeRequestLogContext(c, requestId);
  }
});

api.use(
  '/*',
  cors({
    origin: (origin, c) => {
      const allowed = parseAllowedOrigins(c.env.CORS_ALLOWED_ORIGINS);
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

api.onError((error, c) => {
  if (error instanceof DomainError) {
    return errorResponse(c, error.status, error.message, error.code);
  }
  getRequestLogger(c)?.error(error);
  return errorResponse(c, 500, 'Internal server error', 'INTERNAL_ERROR');
});

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

const workerFetch = withWorkerRequestLogging((request, env, ctx) => app.fetch(request, env, ctx));

export const runAIUsageRecovery = async (
  env: ApiEnv['Bindings'],
  waitUntil: (promise: Promise<unknown>) => void,
) => {
  const log = createWorkerBackgroundLogger(
    { job: { name: 'ai-usage-recovery' } },
    waitUntil,
    env.ENVIRONMENT,
  );
  try {
    const { scanned, reclaimed, failures } = await reclaimStaleAIUsage(env);
    const reconciledBudgets = await reconcileTerminalAIBudgets(env);
    await cleanupAIGovernance(env);
    log.set({
      job: {
        name: 'ai-usage-recovery',
        scanned,
        reclaimed,
        failed: failures.length,
        reconciledBudgets,
      },
    });
    if (failures.length > 0) {
      const firstFailure = failures[0];
      log.error(toWorkerError(firstFailure?.error, 'AI usage recovery failed'), {
        job: {
          name: 'ai-usage-recovery',
          failedUsageIds: failures.map((failure) => failure.usageEventId),
        },
      });
    }
  } catch (error) {
    log.error(toWorkerError(error, 'AI usage recovery failed'));
    throw error;
  } finally {
    log.emit();
  }
};

export default {
  fetch: workerFetch,
  async scheduled(_event: ScheduledEvent, env: ApiEnv['Bindings'], ctx: ExecutionContext) {
    ctx.waitUntil(runAIUsageRecovery(env, ctx.waitUntil.bind(ctx)));
  },
};
