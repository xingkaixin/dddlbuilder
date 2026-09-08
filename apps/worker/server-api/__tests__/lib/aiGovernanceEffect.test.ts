import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { afterEach, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { AIRequestAccess } from '../../lib/aiAccess.js';
import { aiGovernance } from '../../lib/aiRoute.js';
import { AIConfiguration, AIProvider, AIUsage } from '../../lib/aiServices.js';
import { applyCreditMutation } from '../../lib/credits.js';
import type { ApiEnv } from '../../lib/context.js';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';

vi.mock('../../lib/auth.js', () => ({
  authenticateRequest: async () => ({ userId: 'effect-user', email: 'effect@example.com' }),
}));

const databases: Array<ReturnType<typeof createSqliteD1Database>['sqlite']> = [];
afterEach(() => {
  for (const sqlite of databases.splice(0)) sqlite.close();
});

it('runs an injected provider through real credit reservation and settlement', async () => {
  const { database, sqlite } = createSqliteD1Database({ includeMeta: true });
  databases.push(sqlite);
  const env = {
    USER_DB: database,
    OPENAI_API_KEY: 'test-key',
    OPENAI_RATELIMIT_ENABLED: 'false',
  } as ApiEnv['Bindings'];
  sqlite
    .prepare('INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('effect-user', 'User', 'effect@example.com', 1, 1);
  await applyCreditMutation(env, {
    userId: 'effect-user',
    kind: 'grant',
    source: 'signup_bonus',
    amount: 1000,
    idempotencyKey: 'signup_bonus:effect-user',
  });
  const complete = vi.fn(() =>
    Effect.succeed({
      id: 'completion',
      object: 'chat.completion' as const,
      created: 0,
      model: 'test',
      choices: [
        {
          index: 0,
          logprobs: null,
          finish_reason: 'stop' as const,
          message: { role: 'assistant' as const, content: '{"summary":"done"}', refusal: null },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  );
  const services = Layer.mergeAll(
    AIConfiguration.layer(env),
    AIUsage.layer(env),
    Layer.succeed(AIProvider, { complete, stream: () => Effect.die('Unexpected stream') }),
  );
  const app = new Hono<ApiEnv>();
  app.post('/test', (c) =>
    Effect.runPromise(
      aiGovernance(
        c,
        {
          route: 'generate-comments',
          maxOutputTokens: 100,
          bodyMaxBytes: 1024,
          parseRequest: (body) => body,
          buildMessages: () => [{ role: 'user', content: 'Describe the table' }],
        },
        (session) =>
          session
            .completeJson({ scope: 'test', temperature: 0 })
            .pipe(Effect.map((data) => c.json(data))),
      ).pipe(Effect.provide(services), Effect.provide(AIRequestAccess.layer(c))),
    ),
  );

  expect(complete).not.toHaveBeenCalled();
  const response = await app.fetch(
    new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
    env,
    { waitUntil() {}, passThroughOnException() {}, props: {} },
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ summary: 'done' });
  expect(complete).toHaveBeenCalledOnce();
  expect(
    sqlite.prepare('SELECT status, attempt_count, charged_tokens FROM usage_events').get(),
  ).toMatchObject({ status: 'succeeded', attempt_count: 1, charged_tokens: 15 });
  expect(sqlite.prepare('SELECT balance FROM credit_accounts').get()?.balance).toBe(985);
});
