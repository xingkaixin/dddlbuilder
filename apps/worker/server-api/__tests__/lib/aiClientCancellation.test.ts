import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { ApiEnv } from '../../lib/context.js';
import { withAIGovernance } from '../../lib/aiRoute.js';
import { applyCreditMutation } from '../../lib/credits.js';
import { reclaimStaleAIUsage } from '../../lib/aiUsage.js';
import { configureWorkerLogging, withWorkerRequestLogging } from '../../lib/logging.js';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';

vi.mock('../../lib/auth.js', () => ({
  authenticateRequest: async () => ({ userId: 'cancel-user', email: 'cancel@example.com' }),
}));

const databases: Array<ReturnType<typeof createSqliteD1Database>['sqlite']> = [];

describe('AI client cancellation accounting', () => {
  afterEach(() => {
    configureWorkerLogging(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const sqlite of databases.splice(0)) sqlite.close();
  });

  it.each([1, 2])(
    'cancels before provider attempt %i when its D1 response is delayed',
    async (cancelledAttempt) => {
      const events: Array<Record<string, unknown>> = [];
      for (const method of ['log', 'info', 'warn', 'error'] as const) {
        vi.spyOn(console, method).mockImplementation((value: unknown) => {
          if (value && typeof value === 'object' && 'service' in value) {
            events.push(structuredClone(value) as Record<string, unknown>);
          }
        });
      }
      configureWorkerLogging(true);
      const { database, sqlite } = createSqliteD1Database({ includeMeta: true });
      databases.push(sqlite);
      const env = {
        USER_DB: database,
        OPENAI_API_KEY: 'test-key',
        OPENAI_REQUEST_TIMEOUT_MS: '10000',
        OPENAI_RETRY_MAX_ATTEMPTS: '2',
        OPENAI_RETRY_BASE_DELAY_MS: '1',
        OPENAI_RETRY_MAX_DELAY_MS: '1',
        OPENAI_RATELIMIT_ENABLED: 'false',
      } as ApiEnv['Bindings'];
      sqlite
        .prepare(
          'INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('cancel-user', 'User', 'cancel@example.com', 1, 1);
      await applyCreditMutation(env, {
        userId: 'cancel-user',
        kind: 'grant',
        source: 'signup_bonus',
        amount: 1000,
        idempotencyKey: 'signup_bonus:cancel-user',
      });

      let reportPersisted!: () => void;
      const persisted = new Promise<void>((resolve) => {
        reportPersisted = resolve;
      });
      let releaseAttempt!: () => void;
      const reply = new Promise<void>((resolve) => {
        releaseAttempt = resolve;
      });
      const originalPrepare = database.prepare.bind(database);
      vi.spyOn(database, 'prepare').mockImplementation((sql) => {
        const statement = originalPrepare(sql);
        if (!sql.includes('SET attempt_count = COALESCE(attempt_count, 0) + 1')) return statement;
        const bind = statement.bind.bind(statement);
        statement.bind = (...values: unknown[]) => {
          const bound = bind(...values);
          const first = bound.first.bind(bound);
          bound.first = async <T>(column?: string) => {
            const row = column === undefined ? await first<T>() : await first<T>(column);
            const attempt = sqlite.prepare('SELECT attempt_count FROM usage_events').get();
            if (attempt?.attempt_count === cancelledAttempt) {
              reportPersisted();
              await reply;
            }
            return row;
          };
          return bound;
        };
        return statement;
      });

      const upstream = vi.fn(async () => new Response('Unavailable', { status: 503 }));
      vi.stubGlobal('fetch', upstream);
      const background: Promise<unknown>[] = [];
      const app = new Hono<ApiEnv>();
      app.post('/api/test', (c) =>
        withAIGovernance(
          c,
          {
            route: 'explain',
            maxOutputTokens: 100,
            bodyMaxBytes: 1024,
            parseRequest: (body) => body,
            buildMessages: () => [{ role: 'user', content: 'Explain table' }],
          },
          async (session) =>
            session.streamCompletion({ scope: 'cancel-test', temperature: 0, debugInput: {} }),
        ),
      );
      const fetch = withWorkerRequestLogging(app.fetch);
      const response = await fetch(
        new Request('http://localhost/api/test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        }),
        env,
        {
          waitUntil: (task: Promise<unknown>) => background.push(task),
          passThroughOnException() {},
          props: {},
        } as unknown as ExecutionContext,
      );
      await persisted;
      const readUsage = () =>
        sqlite
          .prepare(
            'SELECT status, attempt_count, charged_tokens, estimated_tokens, provider_budget_tokens FROM usage_events',
          )
          .get();
      if (!response.body) throw new Error('Missing stream response body');
      await response.body.cancel();
      expect(readUsage()).toMatchObject({ status: 'reserved', attempt_count: cancelledAttempt });
      releaseAttempt();
      await Promise.all(background);

      const usage = readUsage();
      const expectedCharge = cancelledAttempt === 1 ? 0 : usage?.estimated_tokens;
      expect(upstream).toHaveBeenCalledTimes(cancelledAttempt - 1);
      expect(usage).toMatchObject({
        status: 'failed',
        attempt_count: cancelledAttempt - 1,
        charged_tokens: expectedCharge,
        provider_budget_tokens: expectedCharge,
      });
      expect(await reclaimStaleAIUsage(env, { now: Date.now() + 16 * 60_000 })).toEqual({
        scanned: 0,
        reclaimed: 0,
        failures: [],
      });
      expect(sqlite.prepare('SELECT balance FROM credit_accounts').get()?.balance).toBe(
        1000 - Number(expectedCharge),
      );
      const audits = events.filter((event) => event.ai);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        audit: {
          action: 'ai.request',
          actor: { type: 'user', id: 'cancel-user' },
          outcome: 'failure',
        },
        ai: {
          status: 499,
          attemptCount: cancelledAttempt - 1,
          chargedTokens: expectedCharge,
          accountingFinalized: true,
        },
      });
    },
  );
});
