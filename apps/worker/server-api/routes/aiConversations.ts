import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Cause from 'effect/Cause';
import * as Tracer from 'effect/Tracer';
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- The HTTP entry point supplies the request-scoped platform tracer.
import { makeAITracer } from '../lib/aiTracing.js';
import { getRequestId } from '../lib/http.js';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import { AIConversationRouteSchema } from '@ddlbuilder/shared-types';
import type { Hono, Context } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest } from '../lib/auth.js';
import { DomainError, parseJsonBodyWithLimit } from '../lib/http.js';
import { buildOpenAIConfig } from '../lib/openaiConfig.js';
import { enforceOpenAIRateLimit } from '../openaiControl.js';
import { grantSignupCredits } from '../lib/credits.js';
import { prepareAIScenario } from '../lib/aiScenarios.js';
import { readAIOperation } from '../lib/aiConversationUsage.js';
import { AI_OPERATION_TIMEOUT_MS, AI_RETENTION_MS } from '../lib/aiConversationConfig.js';

const PrepareSchema = Schema.Struct({
  route: AIConversationRouteSchema,
  conversationId: Schema.optional(Schema.String),
});

type ConversationRow = {
  id: string;
  user_id: string;
  route_key: typeof AIConversationRouteSchema.Type;
  expires_at: number;
  deleted_at: number | null;
};

const binding = (c: Context<ApiEnv>) => {
  if (!c.env.AI_CONVERSATIONS)
    throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'AI service unavailable');

  return c.env.AI_CONVERSATIONS;
};

const ownedConversation = async (c: Context<ApiEnv>, id: string, userId: string) => {
  const row = await c.env.USER_DB.prepare(
    'SELECT * FROM ai_conversations WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND expires_at > ?',
  )
    .bind(id, userId, Date.now())
    .first<ConversationRow>();

  if (!row) throw new DomainError(404, 'SERVICE_UNAVAILABLE', 'AI conversation not found');

  return row;
};

const forward = (
  c: Context<ApiEnv>,
  conversationId: string,
  operationId: string,
  userId: string,
  path: string,
  body?: string,
) => {
  const namespace = binding(c);
  const stub = namespace.get(namespace.idFromName(conversationId));

  return stub.fetch(
    new Request(`https://ai.internal${path}?operation=${encodeURIComponent(operationId)}`, {
      method: body !== undefined || path === '/stop' ? 'POST' : 'GET',
      headers: { 'x-ai-user': userId, 'Content-Type': 'application/json' },
      body,
      signal: c.req.raw.signal,
    }),
  );
};

export function registerAIConversationRoutes(app: Hono<ApiEnv>) {
  app.post('/ai/operations', async (c) => {
    const program = Effect.gen(function* () {
      const user = yield* Effect.tryPromise({
        try: () => authenticateRequest(c),
        catch: (error) => error,
      }).pipe(Effect.withSpan('ai.authenticate'));

      return yield* Effect.tryPromise({
        try: async () => {
          binding(c);

          if (!c.env.ANTHROPIC_API_KEY)
            throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'AI service unavailable');
          const parsed = await parseJsonBodyWithLimit(c, 4096);

          if (!parsed.ok) return parsed.response;
          const decoded = Schema.decodeUnknownResult(PrepareSchema)(parsed.data);

          if (Result.isFailure(decoded))
            throw new DomainError(400, 'INVALID_JSON', 'Invalid AI request');
          const input = decoded.success;

          const limited = await enforceOpenAIRateLimit(
            c,
            input.route,
            buildOpenAIConfig(c.env),
            user.userId,
          );

          if (limited.response) return limited.response;
          await grantSignupCredits(c.env, user);
          const conversationId = input.conversationId ?? crypto.randomUUID();

          if (input.conversationId) {
            const conversation = await ownedConversation(c, conversationId, user.userId);

            if (conversation.route_key !== input.route)
              throw new DomainError(409, 'INVALID_JSON', 'AI scenario mismatch');
          } else {
            await c.env.USER_DB.prepare(
              'INSERT INTO ai_conversations (id, user_id, route_key, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
            )
              .bind(
                conversationId,
                user.userId,
                input.route,
                Date.now(),
                Date.now() + AI_RETENTION_MS,
              )
              .run();
          }

          const operationId = crypto.randomUUID();
          await c.env.USER_DB.prepare(
            'INSERT INTO ai_operations (id, conversation_id, user_id, session_id, created_at) VALUES (?, ?, ?, ?, ?)',
          )
            .bind(operationId, conversationId, user.userId, user.sessionId, Date.now())
            .run();

          return c.json({ operationId, conversationId, userId: user.userId }, 201);
        },
        catch: (error) => error,
      });
    }).pipe(Effect.withSpan('ai.request', { attributes: { 'request.id': getRequestId(c) ?? '' } }));
    let tracing: Tracing | undefined;

    try {
      // SAFETY: Cloudflare extends Hono's execution context with optional native tracing.
      tracing = (c.executionCtx as { tracing?: Tracing }).tracing;
    } catch {
      /* Unit request adapters have no platform tracing context. */
    }

    const exit = await Effect.runPromiseExit(
      tracing ? program.pipe(Effect.provideService(Tracer.Tracer, makeAITracer(tracing))) : program,
    );

    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);

    return exit.value;
  });

  app.post('/ai/operations/:id', async (c) => {
    const user = await authenticateRequest(c);
    const operation = await readAIOperation(c.env, c.req.param('id'));

    if (!operation || operation.user_id !== user.userId)
      throw new DomainError(404, 'SERVICE_UNAVAILABLE', 'AI operation not found');
    const conversation = await ownedConversation(c, operation.conversation_id, user.userId);
    const parsed = await parseJsonBodyWithLimit(c, 1024 * 1024);

    if (!parsed.ok) return parsed.response;

    try {
      prepareAIScenario(conversation.route_key, parsed.data);
    } catch {
      throw new DomainError(400, 'INVALID_JSON', 'Invalid AI request');
    }

    const body = JSON.stringify(parsed.data);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));

    const hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    if (operation.input_hash && operation.input_hash !== hash)
      throw new DomainError(409, 'INVALID_JSON', 'Operation input cannot change');

    const accepted =
      await c.env.USER_DB.prepare(`UPDATE ai_operations SET input_hash = ?, submitted_at = COALESCE(submitted_at, ?), deadline_at = COALESCE(deadline_at, ?)
      WHERE id = ? AND (input_hash IS NULL OR input_hash = ?) AND stopped_at IS NULL RETURNING id`)
        .bind(hash, Date.now(), Date.now() + AI_OPERATION_TIMEOUT_MS, operation.id, hash)
        .first();

    if (!accepted) throw new DomainError(409, 'SERVICE_UNAVAILABLE', 'AI operation stopped');
    await c.env.USER_DB.prepare('UPDATE ai_conversations SET expires_at = ? WHERE id = ?')
      .bind(Date.now() + AI_RETENTION_MS, conversation.id)
      .run();

    const response = await forward(
      c,
      conversation.id,
      operation.id,
      user.userId,
      '/submit',
      JSON.stringify({ route: conversation.route_key, input: parsed.data }),
    );

    if (response.status !== 409) return response;
    await response.body?.cancel();
    // The conversation never accepted this operation, so recovery has nothing to resume or settle.
    await c.env.USER_DB.prepare(
      'UPDATE ai_operations SET stopped_at = COALESCE(stopped_at, ?), completed_at = COALESCE(completed_at, ?) WHERE id = ?',
    )
      .bind(Date.now(), Date.now(), operation.id)
      .run();
    throw new DomainError(409, 'SERVICE_UNAVAILABLE', 'AI conversation busy');
  });

  for (const path of ['', '/events', '/stop']) {
    const handler = async (c: Context<ApiEnv>) => {
      const user = await authenticateRequest(c);
      const operation = await readAIOperation(c.env, c.req.param('id') ?? '');

      if (!operation || operation.user_id !== user.userId)
        throw new DomainError(404, 'SERVICE_UNAVAILABLE', 'AI operation not found');
      await ownedConversation(c, operation.conversation_id, user.userId);

      if (path === '/stop') {
        await c.env.USER_DB.prepare(
          'UPDATE ai_operations SET stopped_at = COALESCE(stopped_at, ?) WHERE id = ? AND completed_at IS NULL',
        )
          .bind(Date.now(), operation.id)
          .run();

        if (!operation.submitted_at) return c.json({ stopped: true });
      }

      return forward(c, operation.conversation_id, operation.id, user.userId, path || '/snapshot');
    };

    if (path === '/stop') app.post(`/ai/operations/:id${path}`, handler);
    else app.get(`/ai/operations/:id${path}`, handler);
  }

  app.delete('/ai/conversations/:id', async (c) => {
    const user = await authenticateRequest(c);
    const conversation = await ownedConversation(c, c.req.param('id'), user.userId);

    const { results } = await c.env.USER_DB.prepare(
      'SELECT id FROM ai_operations WHERE conversation_id = ? AND completed_at IS NULL AND submitted_at IS NOT NULL',
    )
      .bind(conversation.id)
      .all<{ id: string }>();

    for (const operation of results) {
      await c.env.USER_DB.prepare(
        'UPDATE ai_operations SET stopped_at = COALESCE(stopped_at, ?) WHERE id = ?',
      )
        .bind(Date.now(), operation.id)
        .run();
      await forward(c, conversation.id, operation.id, user.userId, '/stop');
    }

    await c.env.USER_DB.prepare('UPDATE ai_conversations SET deleted_at = ? WHERE id = ?')
      .bind(Date.now(), conversation.id)
      .run();

    const latest = await c.env.USER_DB.prepare(
      'SELECT id FROM ai_operations WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1',
    )
      .bind(conversation.id)
      .first<{ id: string }>();

    if (latest) {
      const response = await forward(c, conversation.id, latest.id, user.userId, '/delete');
      await response.body?.cancel();
    }

    return c.json({ deleted: true });
  });
}
