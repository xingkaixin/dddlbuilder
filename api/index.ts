import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { applyCspHeaders } from '../server-api/lib/csp.js';
import type { ApiEnv } from '../server-api/lib/context.js';
import { withMeta } from '../server-api/lib/http.js';
import { registerParseSqlRoute } from '../server-api/routes/parseSql.js';
import { registerExplainRoute } from '../server-api/routes/explain.js';
import { registerReviewRoute } from '../server-api/routes/review.js';
import { registerGenerateTableRoute } from '../server-api/routes/generateTable.js';
import { registerShareRoutes } from '../server-api/routes/share.js';

const app = new Hono<ApiEnv>().basePath('/api');

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;

const parseAllowedOrigins = () => {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : DEFAULT_ALLOWED_ORIGINS;
};

const ALLOWED_CORS_ORIGINS = parseAllowedOrigins();

const normalizeIncomingRequestId = (value: string | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!REQUEST_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
};

app.use('/*', async (c, next) => {
  const incoming = normalizeIncomingRequestId(c.req.header('x-request-id'));
  const requestId = incoming ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  await next();
});

app.use(
  '/*',
  cors({
    origin: ALLOWED_CORS_ORIGINS,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposeHeaders: [
      'X-Request-Id',
      'Retry-After',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Window-Ms',
      'X-Budget-Limit-Tokens',
      'X-Budget-Used-Tokens',
    ],
  }),
);

app.use('/*', async (c, next) => {
  await next();
  applyCspHeaders(c);
});

app.get('/health', (c) => c.json(withMeta(c, { status: 'ok' })));

registerParseSqlRoute(app);
registerExplainRoute(app);
registerReviewRoute(app);
registerGenerateTableRoute(app);
registerShareRoutes(app);

export default app;
