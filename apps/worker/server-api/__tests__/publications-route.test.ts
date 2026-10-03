import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../lib/context.js';
import { registerPublicationRoutes } from '../routes/publications.js';
import { createSqliteD1Database } from './helpers/sqliteD1.js';
import { apiRouter } from '../../api/index.js';

describe('publication request guards', () => {
  it('rejects an unauthenticated body before reading or publishing it', async () => {
    const { database, sqlite } = createSqliteD1Database({ includeMeta: true });

    const request = new Request('http://localhost/publications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Rejected publication',
        visibility: 'private',
        revision: 0,
        content: { kind: 'document', tables: [], standards: [] },
      }),
    });

    try {
      const response = await apiRouter.fetch(request, {
        ASSETS: { fetch: globalThis.fetch },
        // SAFETY: Authentication rejection returns before any KV access.
        SHARE_KV: {} as KVNamespace,
        USER_DB: database,
        BETTER_AUTH_SECRET: 'publication-test-secret-with-at-least-32-characters',
        BETTER_AUTH_URL: 'http://localhost',
        RESEND_API_KEY: 're_test_key',
        RESEND_FROM_EMAIL: 'noreply@example.com',
        SIGNUP_BONUS_CREDITS: '100000',
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'AUTH_REQUIRED' });
      expect(request.bodyUsed).toBe(false);
      expect(sqlite.prepare('SELECT * FROM schema_publications').all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it.each([
    {
      headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' },
      status: 403,
      error: 'Invalid origin',
    },
    {
      headers: { origin: 'http://localhost', 'content-type': 'text/plain' },
      status: 415,
      error: 'Use application/json',
    },
  ])(
    'rejects $status before reading a body or writing data',
    async ({ headers, status, error }) => {
      const { database, sqlite } = createSqliteD1Database({ includeMeta: true });
      const app = new Hono<ApiEnv>();
      registerPublicationRoutes(app);

      const request = new Request('http://localhost/publications', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: 'Rejected publication',
          visibility: 'private',
          revision: 0,
          content: { kind: 'document', tables: [], standards: [] },
        }),
      });

      try {
        const response = await app.fetch(request, {
          ASSETS: { fetch: globalThis.fetch },
          // SAFETY: Header rejection returns before any KV access.
          SHARE_KV: {} as KVNamespace,
          USER_DB: database,
        });
        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ error });
        expect(request.bodyUsed).toBe(false);
        expect(sqlite.prepare('SELECT * FROM request_rate_limits').all()).toEqual([]);
        expect(sqlite.prepare('SELECT * FROM schema_publications').all()).toEqual([]);
      } finally {
        sqlite.close();
      }
    },
  );
});
