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
import type { AIOperation } from '../lib/aiConversationUsage.js';
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

const ownedOperation = async (c: Context<ApiEnv>, id: string, userId: string) => {
  const row = await c.env.USER_DB.prepare(`
    SELECT o.*, c.route_key
    FROM ai_operations o JOIN ai_conversations c ON c.id = o.conversation_id
    WHERE o.id = ? AND o.user_id = ? AND c.user_id = ?
      AND c.deleted_at IS NULL AND c.expires_at > ?
  `)
    .bind(id, userId, userId, Date.now())
    .first<AIOperation & Pick<ConversationRow, 'route_key'>>();

  if (!row) throw new DomainError(404, 'SERVICE_UNAVAILABLE', 'AI operation not found');

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

          // The grant is idempotent, so running it for a rate-limited request is harmless.
          const [limited] = await Promise.all([
            enforceOpenAIRateLimit(c, input.route, buildOpenAIConfig(c.env), user.userId),
            grantSignupCredits(c.env, user),
          ]);

          if (limited.response) return limited.response;
          const conversationId = input.conversationId ?? crypto.randomUUID();
          const operationId = crypto.randomUUID();

          const insertOperation = c.env.USER_DB.prepare(
            'INSERT INTO ai_operations (id, conversation_id, user_id, session_id, created_at) VALUES (?, ?, ?, ?, ?)',
          ).bind(operationId, conversationId, user.userId, user.sessionId, Date.now());

          if (input.conversationId) {
            const conversation = await ownedConversation(c, conversationId, user.userId);

            if (conversation.route_key !== input.route)
              throw new DomainError(409, 'INVALID_JSON', 'AI scenario mismatch');
            const now = Date.now();

            const inserted = await c.env.USER_DB.prepare(`
              INSERT INTO ai_operations (id, conversation_id, user_id, session_id, created_at)
              SELECT ?, id, ?, ?, ?
              FROM ai_conversations
              WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND expires_at > ?
              RETURNING id
            `)
              .bind(operationId, user.userId, user.sessionId, now, conversationId, user.userId, now)
              .first<{ id: string }>();

            if (!inserted)
              throw new DomainError(404, 'SERVICE_UNAVAILABLE', 'AI conversation not found');
          } else {
            await c.env.USER_DB.batch([
              c.env.USER_DB.prepare(
                'INSERT INTO ai_conversations (id, user_id, route_key, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
              ).bind(
                conversationId,
                user.userId,
                input.route,
                Date.now(),
                Date.now() + AI_RETENTION_MS,
              ),
              insertOperation,
            ]);
          }

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
    const operation = await ownedOperation(c, c.req.param('id'), user.userId);
    const parsed = await parseJsonBodyWithLimit(c, 1024 * 1024);

    if (!parsed.ok) return parsed.response;

    try {
      prepareAIScenario(operation.route_key, parsed.data);
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
    const now = Date.now();

    const [accepted] = await c.env.USER_DB.batch([
      c.env.USER_DB.prepare(`UPDATE ai_operations SET input_hash = ?, submitted_at = COALESCE(submitted_at, ?), deadline_at = COALESCE(deadline_at, ?)
      WHERE id = ? AND (input_hash IS NULL OR input_hash = ?) AND stopped_at IS NULL
        AND EXISTS (
          SELECT 1 FROM ai_conversations c
          WHERE c.id = ai_operations.conversation_id AND c.deleted_at IS NULL AND c.expires_at > ?
        )
      RETURNING id`).bind(hash, now, now + AI_OPERATION_TIMEOUT_MS, operation.id, hash, now),
      c.env.USER_DB.prepare(
        'UPDATE ai_conversations SET expires_at = ? WHERE id = ? AND deleted_at IS NULL AND expires_at > ?',
      ).bind(now + AI_RETENTION_MS, operation.conversation_id, now),
    ]);

    if (!accepted?.results.length)
      throw new DomainError(409, 'SERVICE_UNAVAILABLE', 'AI operation stopped');

    const response = await forward(
      c,
      operation.conversation_id,
      operation.id,
      user.userId,
      '/submit',
      JSON.stringify({ route: operation.route_key, input: parsed.data }),
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
      const operation = await ownedOperation(c, c.req.param('id') ?? '', user.userId);

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
    let deleted = false;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const now = Date.now();

      const { results: newlyStopped } = await c.env.USER_DB.prepare(`
        UPDATE ai_operations
        SET
          stopped_at = COALESCE(stopped_at, ?),
          completed_at = CASE
            WHEN submitted_at IS NULL THEN COALESCE(completed_at, ?)
            ELSE completed_at
          END
        WHERE conversation_id = ? AND completed_at IS NULL AND stopped_at IS NULL
        RETURNING id, submitted_at
      `)
        .bind(now, now, conversation.id)
        .all<{ id: string; submitted_at: number | null }>();

      const { results: pendingSubmitted } = await c.env.USER_DB.prepare(
        'SELECT id FROM ai_operations WHERE conversation_id = ? AND completed_at IS NULL AND submitted_at IS NOT NULL',
      )
        .bind(conversation.id)
        .all<{ id: string }>();

      const toStop = new Set([
        ...newlyStopped.filter((row) => row.submitted_at !== null).map((row) => row.id),
        ...pendingSubmitted.map((row) => row.id),
      ]);

      for (const operationId of toStop) {
        const stopResponse = await forward(c, conversation.id, operationId, user.userId, '/stop');

        if (!stopResponse.ok && stopResponse.status !== 404 && stopResponse.status !== 409) {
          await stopResponse.body?.cancel();
          throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'AI operation stop failed');
        }

        await stopResponse.body?.cancel();
      }

      const marked = await c.env.USER_DB.prepare(`
        UPDATE ai_conversations
        SET deleted_at = COALESCE(deleted_at, ?)
        WHERE id = ?
          AND NOT EXISTS (
            SELECT 1 FROM ai_operations o
            WHERE o.conversation_id = ai_conversations.id
              AND o.completed_at IS NULL
              AND o.stopped_at IS NULL
          )
        RETURNING id
      `)
        .bind(Date.now(), conversation.id)
        .first<{ id: string }>();

      if (marked) {
        deleted = true;
        break;
      }
    }

    if (!deleted) throw new DomainError(409, 'SERVICE_UNAVAILABLE', 'AI conversation busy');

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
