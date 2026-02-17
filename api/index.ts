import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { registerParseSqlRoute } from './routes/parseSql.js';
import { registerExplainRoute } from './routes/explain.js';
import { registerReviewRoute } from './routes/review.js';
import { registerGenerateTableRoute } from './routes/generateTable.js';
import { registerShareRoutes } from './routes/share.js';

const app = new Hono().basePath('/api');

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

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

app.use(
  '/*',
  cors({
    origin: ALLOWED_CORS_ORIGINS,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.get('/health', (c) => c.json({ status: 'ok' }));

registerParseSqlRoute(app);
registerExplainRoute(app);
registerReviewRoute(app);
registerGenerateTableRoute(app);
registerShareRoutes(app);

export default app;
