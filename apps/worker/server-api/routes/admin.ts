import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { createAdminSession, resolveAdminSession, deleteAdminSession } from '../lib/adminAuth.js';
import { errorResponse, withMeta, parseJsonBodyWithLimit } from '../lib/http.js';
import { createBetterAuth } from '../lib/betterAuth.js';
import { getUserSystemConfig } from '../lib/userSystemConfig.js';
import { applyCreditMutation, listCreditLedger } from '../lib/credits.js';

type AdminUserSummary = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  balance: number;
  createdAt: string;
  disabled: boolean;
};

type AdminUserDetail = AdminUserSummary & {
  updatedAt: string;
  lastActiveAt: string | null;
};

type UsageEventRow = {
  id: string;
  routeKey: string;
  requestId: string;
  estimatedTokens: number;
  actualTotalTokens: number | null;
  status: string;
  errorCode: string | null;
  createdAt: string;
};

const toUserSummary = (row: Record<string, unknown>): AdminUserSummary => ({
  id: String(row.id),
  name: typeof row.name === 'string' ? row.name : '',
  email: String(row.email),
  emailVerified: Number(row.emailVerified) === 1,
  balance: Number(row.balance ?? 0),
  createdAt: new Date(Number(row.createdAt)).toISOString(),
  disabled: row.disabled === 1 || row.disabled === true,
});

const toUsageEventRow = (row: Record<string, unknown>): UsageEventRow => ({
  id: String(row.id),
  routeKey: String(row.routeKey),
  requestId: String(row.requestId),
  estimatedTokens: Number(row.estimatedTokens),
  actualTotalTokens: row.actualTotalTokens !== null ? Number(row.actualTotalTokens) : null,
  status: String(row.status),
  errorCode: typeof row.errorCode === 'string' ? row.errorCode : null,
  createdAt: String(row.createdAt),
});

const parsePagination = (query: Record<string, string | undefined>) => {
  const limit = Math.min(Math.max(Number.parseInt(query.limit ?? '50', 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(query.offset ?? '0', 10) || 0, 0);
  return { limit, offset };
};

const requireAdmin = async (
  env: ApiEnv['Bindings'],
  cookieHeader: string | null | undefined,
): Promise<boolean> => {
  return resolveAdminSession(env, cookieHeader);
};

export function registerAdminRoutes(app: Hono<ApiEnv>) {
  // ─── Session management ──────────────────────────────────────────

  app.post('/admin/session', async (c) => {
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
    return c.json({ ok: true as const }, 200, { 'Set-Cookie': deleteAdminSession() });
  });

  app.get('/admin/session', async (c) => {
    const valid = await requireAdmin(c.env, c.req.header('cookie'));
    return c.json({ authenticated: valid });
  });

  // ─── User management ─────────────────────────────────────────────

  app.get('/admin/users', async (c) => {
    const valid = await requireAdmin(c.env, c.req.header('cookie'));
    if (!valid) {
      return errorResponse(c, 401, 'Admin session required', 'ADMIN_REQUIRED');
    }

    const { limit, offset } = parsePagination(c.req.query());
    const result = await c.env.USER_DB.prepare(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          u.email_verified AS emailVerified,
          u.created_at AS createdAt,
          COALESCE(ca.balance, 0) AS balance,
          CASE WHEN f.user_id IS NOT NULL THEN 1 ELSE 0 END AS disabled
        FROM user u
        LEFT JOIN credit_accounts ca ON u.id = ca.user_id
        LEFT JOIN admin_user_flags f ON u.id = f.user_id
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?
      `,
    )
      .bind(limit, offset)
      .all<Record<string, unknown>>();

    const users = (result.results ?? []).map(toUserSummary);
    return c.json(withMeta(c, { users }));
  });

  app.get('/admin/users/:userId', async (c) => {
    const valid = await requireAdmin(c.env, c.req.header('cookie'));
    if (!valid) {
      return errorResponse(c, 401, 'Admin session required', 'ADMIN_REQUIRED');
    }

    const userId = c.req.param('userId');
    const row = await c.env.USER_DB.prepare(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          u.email_verified AS emailVerified,
          u.created_at AS createdAt,
          u.updated_at AS updatedAt,
          COALESCE(ca.balance, 0) AS balance,
          CASE WHEN f.user_id IS NOT NULL THEN 1 ELSE 0 END AS disabled,
          (
            SELECT MAX(created_at)
            FROM usage_events
            WHERE user_id = u.id
          ) AS lastActiveAt
        FROM user u
        LEFT JOIN credit_accounts ca ON u.id = ca.user_id
        LEFT JOIN admin_user_flags f ON u.id = f.user_id
        WHERE u.id = ?
      `,
    )
      .bind(userId)
      .first<Record<string, unknown>>();

    if (!row) {
      return errorResponse(c, 404, 'User not found');
    }

    const user = toUserSummary(row) as AdminUserDetail;
    user.updatedAt = new Date(Number(row.updatedAt)).toISOString();
    user.lastActiveAt = typeof row.lastActiveAt === 'string' ? row.lastActiveAt : null;

    return c.json(withMeta(c, { user }));
  });

  // ─── User actions ────────────────────────────────────────────────

  app.post('/admin/users/:userId/reset-password', async (c) => {
    const valid = await requireAdmin(c.env, c.req.header('cookie'));
    if (!valid) {
      return errorResponse(c, 401, 'Admin session required', 'ADMIN_REQUIRED');
    }

    const userId = c.req.param('userId');
    const userRow = await c.env.USER_DB.prepare('SELECT email, name FROM user WHERE id = ?')
      .bind(userId)
      .first<{ email: string; name: string }>();

    if (!userRow) {
      return errorResponse(c, 404, 'User not found');
    }

    try {
      const auth = createBetterAuth(c.env);
      const config = getUserSystemConfig(c.env);
      const baseUrl = new URL(config.betterAuthUrl).origin;

      await auth.handler(
        new Request(`${baseUrl}/api/auth/forget-password`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: userRow.email }),
        }),
      );
    } catch (error) {
      console.error('[admin] reset-password failed', error);
      return errorResponse(c, 500, 'Failed to send reset email', 'SERVICE_UNAVAILABLE');
    }

    return c.json(withMeta(c, { ok: true }));
  });

  app.post('/admin/users/:userId/disable', async (c) => {
    const valid = await requireAdmin(c.env, c.req.header('cookie'));
    if (!valid) {
      return errorResponse(c, 401, 'Admin session required', 'ADMIN_REQUIRED');
    }

    const userId = c.req.param('userId');
    const { data: body, errorResponse: err } = await parseJsonBodyWithLimit<{
      reason?: string;
    }>(c, 1024);
    if (err) return err;

    const userRow = await c.env.USER_DB.prepare('SELECT id FROM user WHERE id = ?')
      .bind(userId)
      .first();

    if (!userRow) {
      return errorResponse(c, 404, 'User not found');
    }

    await c.env.USER_DB.batch([
      c.env.USER_DB.prepare(
        'INSERT OR IGNORE INTO admin_user_flags (user_id, disabled_at, disabled_reason) VALUES (?, CURRENT_TIMESTAMP, ?)',
      ).bind(userId, body.reason ?? null),
      c.env.USER_DB.prepare('DELETE FROM session WHERE user_id = ?').bind(userId),
    ]);

    return c.json(withMeta(c, { ok: true }));
  });

  app.post('/admin/users/:userId/enable', async (c) => {
    const valid = await requireAdmin(c.env, c.req.header('cookie'));
    if (!valid) {
      return errorResponse(c, 401, 'Admin session required', 'ADMIN_REQUIRED');
    }

    const userId = c.req.param('userId');

    await c.env.USER_DB.prepare('DELETE FROM admin_user_flags WHERE user_id = ?')
      .bind(userId)
      .run();

    return c.json(withMeta(c, { ok: true }));
  });

  app.post('/admin/users/:userId/email-verification', async (c) => {
    const valid = await requireAdmin(c.env, c.req.header('cookie'));
    if (!valid) {
      return errorResponse(c, 401, 'Admin session required', 'ADMIN_REQUIRED');
    }

    const userId = c.req.param('userId');
    const { data: body, errorResponse: err } = await parseJsonBodyWithLimit<{
      verified?: boolean;
    }>(c, 1024);
    if (err) return err;

    if (typeof body.verified !== 'boolean') {
      return errorResponse(c, 400, 'Verified flag must be a boolean');
    }

    const userRow = await c.env.USER_DB.prepare('SELECT id FROM user WHERE id = ?')
      .bind(userId)
      .first();

    if (!userRow) {
      return errorResponse(c, 404, 'User not found');
    }

    const updatedAt = Date.now();
    if (body.verified) {
      await c.env.USER_DB.prepare('UPDATE user SET email_verified = 1, updated_at = ? WHERE id = ?')
        .bind(updatedAt, userId)
        .run();
    } else {
      await c.env.USER_DB.batch([
        c.env.USER_DB.prepare(
          'UPDATE user SET email_verified = 0, updated_at = ? WHERE id = ?',
        ).bind(updatedAt, userId),
        c.env.USER_DB.prepare('DELETE FROM session WHERE user_id = ?').bind(userId),
      ]);
    }

    return c.json(withMeta(c, { ok: true, emailVerified: body.verified }));
  });

  // ─── Credits ─────────────────────────────────────────────────────

  app.post('/admin/users/:userId/credits', async (c) => {
    const valid = await requireAdmin(c.env, c.req.header('cookie'));
    if (!valid) {
      return errorResponse(c, 401, 'Admin session required', 'ADMIN_REQUIRED');
    }

    const userId = c.req.param('userId');
    const { data: body, errorResponse: err } = await parseJsonBodyWithLimit<{
      amount?: number;
      note?: string;
    }>(c, 1024);
    if (err) return err;

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return errorResponse(c, 400, 'Amount must be a positive number');
    }

    const userRow = await c.env.USER_DB.prepare('SELECT id FROM user WHERE id = ?')
      .bind(userId)
      .first();

    if (!userRow) {
      return errorResponse(c, 404, 'User not found');
    }

    try {
      const ledger = await applyCreditMutation(c.env, {
        userId,
        kind: 'grant',
        source: 'manual_adjustment',
        amount,
        idempotencyKey: `admin_grant:${userId}:${crypto.randomUUID()}`,
        metadata: {
          adminAction: 'manual_credit_grant',
          ...(body.note ? { adminNote: body.note } : {}),
        },
      });

      return c.json(withMeta(c, { ok: true, newBalance: ledger.balanceAfter }));
    } catch (error) {
      console.error('[admin] grant credits failed', error);
      const message = error instanceof Error ? error.message : 'Credit operation failed';
      return errorResponse(c, 500, message);
    }
  });

  app.get('/admin/users/:userId/credits/ledger', async (c) => {
    const valid = await requireAdmin(c.env, c.req.header('cookie'));
    if (!valid) {
      return errorResponse(c, 401, 'Admin session required', 'ADMIN_REQUIRED');
    }

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
    const valid = await requireAdmin(c.env, c.req.header('cookie'));
    if (!valid) {
      return errorResponse(c, 401, 'Admin session required', 'ADMIN_REQUIRED');
    }

    const userId = c.req.param('userId');
    const { limit, offset } = parsePagination(c.req.query());

    const [dataResult, countResult] = await Promise.all([
      c.env.USER_DB.prepare(
        `
          SELECT
            id,
            route_key AS routeKey,
            request_id AS requestId,
            estimated_tokens AS estimatedTokens,
            actual_total_tokens AS actualTotalTokens,
            status,
            error_code AS errorCode,
            created_at AS createdAt
          FROM usage_events
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `,
      )
        .bind(userId, limit, offset)
        .all<Record<string, unknown>>(),
      c.env.USER_DB.prepare('SELECT COUNT(*) AS total FROM usage_events WHERE user_id = ?')
        .bind(userId)
        .first<{ total: number }>(),
    ]);

    const items = (dataResult.results ?? []).map(toUsageEventRow);
    const total = countResult?.total ?? 0;

    return c.json(withMeta(c, { items, total }));
  });
}
