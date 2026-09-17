import * as Schema from 'effect/Schema';
import { PublicationWriteSchema, CommentWriteSchema } from '@ddlbuilder/shared-types/api';
import type { Context, Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest, resolveAuthenticatedUser } from '../lib/auth.js';
import { DomainError, errorResponse, parseJsonBodyWithLimit } from '../lib/http.js';
import { enforceIpRateLimit } from '../lib/requestRateLimit.js';
import {
  listPublications,
  readPublication,
  writePublication,
  deletePublication,
  readPublicationComments,
  addPublicationComment,
  resolvePublicationComment,
} from '../lib/publications.js';

const policy = { scope: 'publication:write', limit: 120, windowMs: 3600000 };

async function readInput<T>(c: Context<ApiEnv>, schema: Schema.ConstraintDecoder<T>) {
  const parsed = await parseJsonBodyWithLimit(c, 600 * 1024);

  if (!parsed.ok)
    throw new DomainError(
      parsed.response.status === 413 ? 413 : 400,
      'INVALID_JSON',
      'Invalid publication request',
    );

  try {
    return Schema.decodeUnknownSync(schema)(parsed.data);
  } catch {
    throw new DomainError(400, 'INVALID_JSON', 'Invalid publication request');
  }
}

export function registerPublicationRoutes(app: Hono<ApiEnv>) {
  app.use('/publications/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex, nofollow');

    if (c.req.method !== 'GET') {
      const origin = c.req.header('origin');
      const allowed = (c.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim());

      if (origin && origin !== new URL(c.req.url).origin && !allowed.includes(origin))
        return errorResponse(c, 403, 'Invalid origin');
      if (!c.req.header('content-type')?.includes('application/json'))
        return errorResponse(c, 415, 'Use application/json');
      const limited = await enforceIpRateLimit(c, policy, 'Too many publication requests');

      if (limited) return limited;
    }

    await next();
  });
  app.get('/publications', async (c) => {
    const user = await authenticateRequest(c);
    c.header('Cache-Control', 'no-store');

    return c.json(await listPublications(c.env.USER_DB, user.userId));
  });
  app.post('/publications', async (c) => {
    const user = await authenticateRequest(c);
    const input = await readInput(c, PublicationWriteSchema);

    return c.json(await writePublication(c.env.USER_DB, user.userId, input), 201);
  });
  app.get('/publications/:id', async (c) => {
    const user = await resolveAuthenticatedUser(c);

    return c.json(await readPublication(c.env.USER_DB, c.req.param('id'), user?.userId ?? null));
  });
  app.put('/publications/:id', async (c) => {
    const user = await authenticateRequest(c);
    const input = await readInput(c, PublicationWriteSchema);

    return c.json(await writePublication(c.env.USER_DB, user.userId, input, c.req.param('id')));
  });
  app.delete('/publications/:id', async (c) => {
    const user = await authenticateRequest(c);
    await deletePublication(c.env.USER_DB, user.userId, c.req.param('id'));

    return c.json({ success: true });
  });
  app.get('/publications/:id/comments', async (c) => {
    const user = await resolveAuthenticatedUser(c);

    return c.json(
      await readPublicationComments(c.env.USER_DB, c.req.param('id'), user?.userId ?? null),
    );
  });
  app.post('/publications/:id/comments', async (c) => {
    const user = await authenticateRequest(c);
    const input = await readInput(c, CommentWriteSchema);
    await addPublicationComment(c.env.USER_DB, c.req.param('id'), user, input.target, input.body);

    return c.json({ success: true }, 201);
  });
  app.put('/publications/:id/comments/:commentId', async (c) => {
    const user = await authenticateRequest(c);
    const input = await readInput(c, Schema.Struct({ resolved: Schema.Boolean }));
    await resolvePublicationComment(
      c.env.USER_DB,
      c.req.param('id'),
      c.req.param('commentId'),
      user.userId,
      input.resolved,
    );

    return c.json({ success: true });
  });
}
