import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import api from './api/index';

const app = new Hono();

// Mount API routes
app.route('/', api);

// Serve static files from dist/
app.use('/*', serveStatic({ root: './dist' }));

// Fallback to index.html for SPA routing
app.get('*', serveStatic({ path: './dist/index.html' }));

const port = Number(process.env.PORT) || 3000;

console.log(`🚀 Server running at http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
