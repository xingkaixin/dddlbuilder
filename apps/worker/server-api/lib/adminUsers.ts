export type AdminUserSummary = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  balance: number;
  createdAt: string;
  disabled: boolean;
};

export type AdminUserDetail = AdminUserSummary & {
  updatedAt: string;
  lastActiveAt: string | null;
};

export type AdminUsageEvent = {
  id: string;
  routeKey: string;
  requestId: string;
  estimatedTokens: number;
  actualTotalTokens: number | null;
  status: string;
  errorCode: string | null;
  createdAt: string;
};

type Pagination = {
  limit: number;
  offset: number;
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

const toUsageEvent = (row: Record<string, unknown>): AdminUsageEvent => ({
  id: String(row.id),
  routeKey: String(row.routeKey),
  requestId: String(row.requestId),
  estimatedTokens: Number(row.estimatedTokens),
  actualTotalTokens: row.actualTotalTokens !== null ? Number(row.actualTotalTokens) : null,
  status: String(row.status),
  errorCode: typeof row.errorCode === 'string' ? row.errorCode : null,
  createdAt: String(row.createdAt),
});

export const listAdminUsers = async (
  db: D1Database,
  { limit, offset }: Pagination,
): Promise<AdminUserSummary[]> => {
  const result = await db
    .prepare(
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
  return (result.results ?? []).map(toUserSummary);
};

export const getAdminUser = async (
  db: D1Database,
  userId: string,
): Promise<AdminUserDetail | null> => {
  const row = await db
    .prepare(
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
  if (!row) return null;
  return {
    ...toUserSummary(row),
    updatedAt: new Date(Number(row.updatedAt)).toISOString(),
    lastActiveAt: typeof row.lastActiveAt === 'string' ? row.lastActiveAt : null,
  };
};

export const getAdminUserContact = (db: D1Database, userId: string) =>
  db.prepare('SELECT email, name FROM user WHERE id = ?').bind(userId).first<{
    email: string;
    name: string;
  }>();

export const adminUserExists = async (db: D1Database, userId: string): Promise<boolean> =>
  Boolean(await db.prepare('SELECT id FROM user WHERE id = ?').bind(userId).first());

export const disableAdminUser = async (
  db: D1Database,
  userId: string,
  reason?: string,
): Promise<void> => {
  await db.batch([
    db
      .prepare(
        'INSERT OR IGNORE INTO admin_user_flags (user_id, disabled_at, disabled_reason) VALUES (?, CURRENT_TIMESTAMP, ?)',
      )
      .bind(userId, reason ?? null),
    db.prepare('DELETE FROM session WHERE user_id = ?').bind(userId),
  ]);
};

export const enableAdminUser = async (db: D1Database, userId: string): Promise<void> => {
  await db.prepare('DELETE FROM admin_user_flags WHERE user_id = ?').bind(userId).run();
};

export const setAdminUserEmailVerification = async (
  db: D1Database,
  userId: string,
  verified: boolean,
): Promise<void> => {
  const updatedAt = Date.now();
  if (verified) {
    await db
      .prepare('UPDATE user SET email_verified = 1, updated_at = ? WHERE id = ?')
      .bind(updatedAt, userId)
      .run();
    return;
  }
  await db.batch([
    db
      .prepare('UPDATE user SET email_verified = 0, updated_at = ? WHERE id = ?')
      .bind(updatedAt, userId),
    db.prepare('DELETE FROM session WHERE user_id = ?').bind(userId),
  ]);
};

export const listAdminUsageEvents = async (
  db: D1Database,
  userId: string,
  { limit, offset }: Pagination,
): Promise<{ items: AdminUsageEvent[]; total: number }> => {
  const [dataResult, countResult] = await Promise.all([
    db
      .prepare(
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
    db
      .prepare('SELECT COUNT(*) AS total FROM usage_events WHERE user_id = ?')
      .bind(userId)
      .first<{ total: number }>(),
  ]);
  return {
    items: (dataResult.results ?? []).map(toUsageEvent),
    total: countResult?.total ?? 0,
  };
};
