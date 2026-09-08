import * as Schema from 'effect/Schema';
import {
  AdminPaginationQuerySchema,
  AdminLedgerQuerySchema,
  AdminActionResponseSchema,
  AdminSessionResponseSchema,
  AdminUsersResponseSchema,
  AdminUserResponseSchema,
  AdminLedgerResponseSchema,
  AdminUsageResponseSchema,
  AdminEmailVerificationResponseSchema,
  AdminCreditGrantResponseSchema,
  AdminLoginRequestSchema,
  AdminDisableRequestSchema,
  AdminEmailVerificationRequestSchema,
  AdminCreditGrantRequestSchema,
} from '@ddlbuilder/shared-types/api';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { createAdminSession, resolveAdminSession, deleteAdminSession } from '../lib/adminAuth.js';
import { errorResponse, withMeta, parseJsonBodyWithLimit } from '../lib/http.js';
import { createBetterAuth } from '../lib/betterAuth.js';
import { applyCreditMutation, listCreditLedger } from '../lib/credits.js';
import { enforceIpRateLimit } from '../lib/requestRateLimit.js';
import { revokeUserSessions } from '../lib/auth.js';
import { getRequestLogger, toWorkerError } from '../lib/logging.js';
import {
  adminUserExists,
  disableAdminUser,
  enableAdminUser,
  getAdminUser,
  getAdminUserContact,
  listAdminUsageEvents,
  listAdminUsers,
  setAdminUserEmailVerification,
} from '../lib/adminUsers.js';

const ADMIN_LOGIN_RATE_LIMIT = {
  scope: 'admin:login',
  limit: 5,
  windowMs: 15 * 60 * 1000,
} as const;

const requireAdminSession: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const valid = await resolveAdminSession(c.env, c.req.header('cookie'));
  if (!valid) {
    return errorResponse(c, 401, 'Admin session required', 'ADMIN_REQUIRED');
  }
  await next();
};

const revokeUserSessionsOrError = async (c: Context<ApiEnv>, userId: string) => {
  try {
    await revokeUserSessions(c.env, userId);
    return null;
  } catch (error) {
    getRequestLogger(c)?.error(toWorkerError(error, 'Admin session revocation failed'), {
      outcome: { errorCode: 'SERVICE_UNAVAILABLE' },
    });
    return errorResponse(c, 503, 'Failed to revoke active sessions', 'SERVICE_UNAVAILABLE');
  }
};

export function registerAdminRoutes(app: Hono<ApiEnv>) {
  // ─── Session management ──────────────────────────────────────────

  app.post('/admin/session', async (c) => {
    const limited = await enforceIpRateLimit(
      c,
      ADMIN_LOGIN_RATE_LIMIT,
      'Too many admin login attempts',
    );
    if (limited) return limited;

    const parsedBody = await parseJsonBodyWithLimit<{
      password?: string;
    }>(c, 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const request = Schema.decodeUnknownOption(AdminLoginRequestSchema)(parsedBody.data);
    if (request._tag === 'None') {
      return errorResponse(c, 400, 'Password is required', 'ADMIN_REQUIRED');
    }

    const result = await createAdminSession(c.env, request.value.password);
    if (!result.success) {
      return errorResponse(c, 401, 'Invalid admin password', 'ADMIN_REQUIRED');
    }

    return c.json(Schema.decodeUnknownSync(AdminActionResponseSchema)({ ok: true }), 200, {
      'Set-Cookie': result.setCookie,
    });
  });

  app.delete('/admin/session', async (c) => {
    const setCookie = await deleteAdminSession(c.env, c.req.header('cookie'));
    return c.json(Schema.decodeUnknownSync(AdminActionResponseSchema)({ ok: true }), 200, {
      'Set-Cookie': setCookie,
    });
  });

  app.get('/admin/session', async (c) => {
    const valid = await resolveAdminSession(c.env, c.req.header('cookie'));
    return c.json(Schema.decodeUnknownSync(AdminSessionResponseSchema)({ authenticated: valid }));
  });

  // ─── User management ─────────────────────────────────────────────

  app.use('/admin/users', requireAdminSession);
  app.use('/admin/users/*', requireAdminSession);

  app.get('/admin/users', async (c) => {
    const { limit, offset } = Schema.decodeUnknownSync(AdminPaginationQuerySchema)(c.req.query());
    const users = await listAdminUsers(c.env.USER_DB, { limit, offset });
    return c.json(Schema.decodeUnknownSync(AdminUsersResponseSchema)(withMeta(c, { users })));
  });

  app.get('/admin/users/:userId', async (c) => {
    const user = await getAdminUser(c.env.USER_DB, c.req.param('userId'));
    if (!user) {
      return errorResponse(c, 404, 'User not found');
    }
    return c.json(Schema.decodeUnknownSync(AdminUserResponseSchema)(withMeta(c, { user })));
  });

  // ─── User actions ────────────────────────────────────────────────

  app.post('/admin/users/:userId/reset-password', async (c) => {
    const userId = c.req.param('userId');
    const userRow = await getAdminUserContact(c.env.USER_DB, userId);

    if (!userRow) {
      return errorResponse(c, 404, 'User not found');
    }

    try {
      const auth = createBetterAuth(c.env);
      await auth.api.requestPasswordReset({
        body: { email: userRow.email, redirectTo: '/?auth_action=reset-password' },
      });
    } catch (error) {
      getRequestLogger(c)?.error(toWorkerError(error, 'Admin password reset failed'), {
        outcome: { errorCode: 'SERVICE_UNAVAILABLE' },
      });
      return errorResponse(c, 502, 'Failed to send reset email', 'SERVICE_UNAVAILABLE');
    }

    return c.json(Schema.decodeUnknownSync(AdminActionResponseSchema)(withMeta(c, { ok: true })));
  });

  app.post('/admin/users/:userId/disable', async (c) => {
    const userId = c.req.param('userId');
    const parsedBody = await parseJsonBodyWithLimit<{
      reason?: string;
    }>(c, 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const request = Schema.decodeUnknownOption(AdminDisableRequestSchema)(parsedBody.data);
    if (request._tag === 'None') return errorResponse(c, 400, 'Reason must be a string');
    const body = request.value;

    if (!(await adminUserExists(c.env.USER_DB, userId))) {
      return errorResponse(c, 404, 'User not found');
    }

    await disableAdminUser(c.env.USER_DB, userId, body.reason);
    const revocationError = await revokeUserSessionsOrError(c, userId);
    if (revocationError) return revocationError;

    return c.json(Schema.decodeUnknownSync(AdminActionResponseSchema)(withMeta(c, { ok: true })));
  });

  app.post('/admin/users/:userId/enable', async (c) => {
    const userId = c.req.param('userId');
    await enableAdminUser(c.env.USER_DB, userId);

    return c.json(Schema.decodeUnknownSync(AdminActionResponseSchema)(withMeta(c, { ok: true })));
  });

  app.post('/admin/users/:userId/email-verification', async (c) => {
    const userId = c.req.param('userId');
    const parsedBody = await parseJsonBodyWithLimit<{
      verified?: boolean;
    }>(c, 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const request = Schema.decodeUnknownOption(AdminEmailVerificationRequestSchema)(
      parsedBody.data,
    );
    if (request._tag === 'None') {
      return errorResponse(c, 400, 'Verified flag must be a boolean');
    }
    const body = request.value;

    if (!(await adminUserExists(c.env.USER_DB, userId))) {
      return errorResponse(c, 404, 'User not found');
    }

    await setAdminUserEmailVerification(c.env.USER_DB, userId, body.verified);
    if (!body.verified) {
      const revocationError = await revokeUserSessionsOrError(c, userId);
      if (revocationError) return revocationError;
    }

    return c.json(
      Schema.decodeUnknownSync(AdminEmailVerificationResponseSchema)(
        withMeta(c, { ok: true, emailVerified: body.verified }),
      ),
    );
  });

  // ─── Credits ─────────────────────────────────────────────────────

  app.post('/admin/users/:userId/credits', async (c) => {
    const userId = c.req.param('userId');
    const parsedBody = await parseJsonBodyWithLimit<{
      amount?: number;
      note?: string;
    }>(c, 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const input = parsedBody.data;
    const request = Schema.decodeUnknownOption(AdminCreditGrantRequestSchema)({
      ...input,
      amount: Number(input?.amount),
    });
    if (request._tag === 'None') {
      return errorResponse(
        c,
        400,
        Schema.is(AdminCreditGrantRequestSchema.fields.amount)(Number(input?.amount))
          ? 'Note must be a string'
          : 'Amount must be a positive safe integer',
      );
    }
    const body = request.value;
    const { amount } = body;

    if (!(await adminUserExists(c.env.USER_DB, userId))) {
      return errorResponse(c, 404, 'User not found');
    }

    const clientKey = c.req.header('Idempotency-Key')?.trim();
    if (clientKey && clientKey.length > 128) {
      return errorResponse(c, 400, 'Idempotency-Key too long');
    }

    const ledger = await applyCreditMutation(c.env, {
      userId,
      kind: 'grant',
      source: 'manual_adjustment',
      amount,
      idempotencyKey: `admin_grant:${userId}:${clientKey ?? crypto.randomUUID()}`,
      metadata: {
        adminAction: 'manual_credit_grant',
        ...(body.note ? { adminNote: body.note } : {}),
      },
    });

    return c.json(
      Schema.decodeUnknownSync(AdminCreditGrantResponseSchema)(
        withMeta(c, { ok: true, newBalance: ledger.balanceAfter }),
      ),
    );
  });

  app.get('/admin/users/:userId/credits/ledger', async (c) => {
    const userId = c.req.param('userId');
    const { limit } = Schema.decodeUnknownSync(AdminLedgerQuerySchema)({
      limit: c.req.query('limit'),
    });

    const items = await listCreditLedger(c.env, userId, { limit, offset: 0 });
    return c.json(Schema.decodeUnknownSync(AdminLedgerResponseSchema)(withMeta(c, { items })));
  });

  // ─── Usage events ────────────────────────────────────────────────

  app.get('/admin/users/:userId/usage-events', async (c) => {
    const userId = c.req.param('userId');
    const { limit, offset } = Schema.decodeUnknownSync(AdminPaginationQuerySchema)(c.req.query());
    return c.json(
      Schema.decodeUnknownSync(AdminUsageResponseSchema)(
        withMeta(c, await listAdminUsageEvents(c.env.USER_DB, userId, { limit, offset })),
      ),
    );
  });
}
