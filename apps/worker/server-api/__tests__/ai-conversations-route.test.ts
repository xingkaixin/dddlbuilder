import * as Schema from 'effect/Schema';
import { AIOperationIdentitySchema } from '@ddlbuilder/shared-types';
import type * as AuthModule from '../lib/auth.js';
import { Hono } from 'hono';
import { it, expect, vi } from 'vitest';
import type { ApiEnv } from '../lib/context.js';
import { DomainError } from '../lib/http.js';
import { registerAIConversationRoutes } from '../routes/aiConversations.js';
import { createAIRuntimeFixture } from './helpers/aiRuntime.js';

// oxlint-disable-next-line anti-slop/no-module-mocking -- Real authentication has its own tests; these tests exercise operation ownership and replay with real D1 and DO state.
vi.mock('../lib/auth.js', async (importOriginal) => {
  const original = await importOriginal<typeof AuthModule>();

  return {
    ...original,
    authenticateRequest: async (c: { req: { header(name: string): string | undefined } }) => {
      const userId = c.req.header('test-user');

      if (!userId) throw new DomainError(401, 'AUTH_REQUIRED', 'Sign in');

      return {
        userId,
        sessionId: 'session',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User',
      };
    },
  };
});

it('protects operation ownership, immutable submissions and stopped prepared operations', async () => {
  const test = await createAIRuntimeFixture({ bindings: { ANTHROPIC_API_KEY: '' } });
  const app = new Hono<ApiEnv>();
  registerAIConversationRoutes(app);
  app.onError((error, c) =>
    error instanceof DomainError
      ? new Response(error.message, { status: error.status })
      : c.text(error.message, 500),
  );
  const forwarded: Request[] = [];
  let busyOperation = '';

  // SAFETY: the namespace fixture implements only name lookup and fetch used by the route.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Partial Cloudflare binding backed by the real runtime fixture.
  const namespace = {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (request: Request) => {
        forwarded.push(request);

        return new URL(request.url).searchParams.get('operation') === busyOperation
          ? new Response('Conversation busy', { status: 409 })
          : Response.json({ accepted: true });
      },
    }),
  } as unknown as DurableObjectNamespace;
  const env = {
    ...test.env,
    AI_CONVERSATIONS: namespace,
    ANTHROPIC_API_KEY: 'test',
    OPENAI_RATELIMIT_ENABLED: 'false',
  };
  const request = (
    path: string,
    method = 'GET',
    user = 'user-1',
    body?: { route?: string; sql?: string },
  ) =>
    app.request(
      path,
      {
        method,
        headers: { 'test-user': user, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      },
      env,
    );
  expect((await request('/ai/operations', 'POST', '', { route: 'explain' })).status).toBe(401);
  expect((await request('/ai/operations/operation', 'GET', 'other-user')).status).toBe(404);
  expect((await request('/ai/operations', 'POST', 'user-1', { route: 'invalid' })).status).toBe(
    400,
  );

  const prepared = Schema.decodeUnknownSync(AIOperationIdentitySchema)(
    await (await request('/ai/operations', 'POST', 'user-1', { route: 'explain' })).json(),
  );
  const path = `/ai/operations/${prepared.operationId}`;
  expect((await request(path, 'POST', 'user-1', { sql: 'SELECT 1' })).status).toBe(200);
  expect((await request(path, 'POST', 'user-1', { sql: 'SELECT 2' })).status).toBe(409);
  expect((await request(path, 'POST', 'user-1', { sql: 'SELECT 1' })).status).toBe(200);
  expect(forwarded).toHaveLength(2);

  const second = Schema.decodeUnknownSync(AIOperationIdentitySchema)(
    await (await request('/ai/operations', 'POST', 'user-1', { route: 'explain' })).json(),
  );
  expect((await request(`/ai/operations/${second.operationId}/stop`, 'POST')).status).toBe(200);
  expect(
    (await request(`/ai/operations/${second.operationId}`, 'POST', 'user-1', { sql: 'SELECT 1' }))
      .status,
  ).toBe(409);

  const rejected = Schema.decodeUnknownSync(AIOperationIdentitySchema)(
    await (await request('/ai/operations', 'POST', 'user-1', { route: 'explain' })).json(),
  );
  busyOperation = rejected.operationId;
  expect(
    (await request(`/ai/operations/${rejected.operationId}`, 'POST', 'user-1', { sql: 'SELECT 1' }))
      .status,
  ).toBe(409);
  expect(
    test.sqlite
      .prepare('SELECT completed_at IS NOT NULL AS closed FROM ai_operations WHERE id = ?')
      .get(rejected.operationId),
  ).toEqual({ closed: 1 });
});
