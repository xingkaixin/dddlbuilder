import type { Hono, MiddlewareHandler } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { createAdminSession, resolveAdminSession, deleteAdminSession } from '../lib/adminAuth.js';
import { errorResponse, withMeta, parseJsonBodyWithLimit } from '../lib/http.js';
import { createBetterAuth } from '../lib/betterAuth.js';
import { getUserSystemConfig } from '../lib/userSystemConfig.js';
import { applyCreditMutation, listCreditLedger } from '../lib/credits.js';
import { enforceIpRateLimit } from '../lib/requestRateLimit.js';
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

const parsePagination = (query: Record<string, string | undefined>) => {
  const limit = Math.min(Math.max(Number.parseInt(query.limit ?? '50', 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(query.offset ?? '0', 10) || 0, 0);
  return { limit, offset };
};

const requireAdminSession: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const valid = await resolveAdminSession(c.env, c.req.header('cookie'));
  if (!valid) {
    return errorResponse(c, 401, 'Admin session required', 'ADMIN_REQUIRED');
  }
  await next();
};

export function registerAdminRoutes(app: Hono<ApiEnv>) {
  // ─── Session management ──────────────────────────────────────────

  app.post('/admin/session', async (c) => {
    const limited = await enforceIpRateLimit(c, ADMIN_LOGIN_RATE_LIMIT, 'Too many admin login attempts');
    if (limited) return limited;

    const { data: body, errorResponse: err } = await parseJsonBodyWithLimit<{
      password?: string;
    }>(c, 1024);
    if (err) return err;

    const password = typeof body.password === 'string' ? body.password.trim() : '';
    if (!password) {
      return errorResponse(c, 400, 'Password is required', 'ADMIN_REQUIRED');
    }

    const result = await createAdminSession(c.env, password);
    if (!result.success) {
      return errorResponse(c, 401, 'Invalid admin password', 'ADMIN_REQUIRED');
    }

    return c.json({ ok: true as const }, 200, { 'Set-Cookie': result.setCookie });
  });

  app.delete('/admin/session', async (c) => {
    const setCookie = await deleteAdminSession(c.env, c.req.header('cookie'));
    return c.json({ ok: true as const }, 200, { 'Set-Cookie': setCookie });
  });

  app.get('/admin/session', async (c) => {
    const valid = await resolveAdminSession(c.env, c.req.header('cookie'));
    return c.json({ authenticated: valid });
  });

  // ─── User management ─────────────────────────────────────────────

  app.use('/admin/users', requireAdminSession);
  app.use('/admin/users/*', requireAdminSession);

  app.get('/admin/users', async (c) => {
    const { limit, offset } = parsePagination(c.req.query());
    const users = await listAdminUsers(c.env.USER_DB, { limit, offset });
    return c.json(withMeta(c, { users }));
  });

  app.get('/admin/users/:userId', async (c) => {
    const user = await getAdminUser(c.env.USER_DB, c.req.param('userId'));
    if (!user) {
      return errorResponse(c, 404, 'User not found');
    }
    return c.json(withMeta(c, { user }));
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
      const config = getUserSystemConfig(c.env);
      const baseUrl = new URL(config.betterAuthUrl).origin;

      const response = await auth.handler(
        new Request(`${baseUrl}/api/auth/forget-password`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: userRow.email }),
        }),
      );
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        console.error('[admin] reset-password rejected', {
          status: response.status,
          detail: detail.slice(0, 256),
        });
        return errorResponse(c, 502, 'Failed to send reset email', 'SERVICE_UNAVAILABLE');
      }
    } catch (error) {
      console.error('[admin] reset-password failed', error);
      return errorResponse(c, 500, 'Failed to send reset email', 'SERVICE_UNAVAILABLE');
    }

    return c.json(withMeta(c, { ok: true }));
  });

  app.post('/admin/users/:userId/disable', async (c) => {
    const userId = c.req.param('userId');
    const { data: body, errorResponse: err } = await parseJsonBodyWithLimit<{
      reason?: string;
    }>(c, 1024);
    if (err) return err;

    if (!(await adminUserExists(c.env.USER_DB, userId))) {
      return errorResponse(c, 404, 'User not found');
    }

    await disableAdminUser(c.env.USER_DB, userId, body.reason);

    return c.json(withMeta(c, { ok: true }));
  });

  app.post('/admin/users/:userId/enable', async (c) => {
    const userId = c.req.param('userId');
    await enableAdminUser(c.env.USER_DB, userId);

    return c.json(withMeta(c, { ok: true }));
  });

  app.post('/admin/users/:userId/email-verification', async (c) => {
    const userId = c.req.param('userId');
    const { data: body, errorResponse: err } = await parseJsonBodyWithLimit<{
      verified?: boolean;
    }>(c, 1024);
    if (err) return err;

    if (typeof body.verified !== 'boolean') {
      return errorResponse(c, 400, 'Verified flag must be a boolean');
    }

    if (!(await adminUserExists(c.env.USER_DB, userId))) {
      return errorResponse(c, 404, 'User not found');
    }

    await setAdminUserEmailVerification(c.env.USER_DB, userId, body.verified);

    return c.json(withMeta(c, { ok: true, emailVerified: body.verified }));
  });

  // ─── Credits ─────────────────────────────────────────────────────

  app.post('/admin/users/:userId/credits', async (c) => {
    const userId = c.req.param('userId');
    const { data: body, errorResponse: err } = await parseJsonBodyWithLimit<{
      amount?: number;
      note?: string;
    }>(c, 1024);
    if (err) return err;

    const amount = Number(body.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return errorResponse(c, 400, 'Amount must be a positive safe integer');
    }

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

    return c.json(withMeta(c, { ok: true, newBalance: ledger.balanceAfter }));
  });

  app.get('/admin/users/:userId/credits/ledger', async (c) => {
    const userId = c.req.param('userId');
    const limit = Math.min(
      Math.max(Number.parseInt(c.req.query('limit') ?? '20', 10) || 20, 1),
      100,
    );

    const items = await listCreditLedger(c.env, userId, { limit, offset: 0 });
    return c.json(withMeta(c, { items }));
  });

  // ─── Usage events ────────────────────────────────────────────────

  app.get('/admin/users/:userId/usage-events', async (c) => {
    const userId = c.req.param('userId');
    const { limit, offset } = parsePagination(c.req.query());
    return c.json(
      withMeta(c, await listAdminUsageEvents(c.env.USER_DB, userId, { limit, offset })),
    );
  });
}
