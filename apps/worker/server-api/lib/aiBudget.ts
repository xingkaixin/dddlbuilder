import type { ApiEnv } from './context.js';

const DAILY_BUDGET_SCOPE = 'daily-budget';
const DAILY_BUDGET_SUBJECT = 'global';

const getCurrentUtcDateKey = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const getBudgetExpiry = () => {
  const now = new Date();
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 1);
  return Math.max(Date.now() + 60_000, tomorrow);
};

const readBudgetValue = async (env: ApiEnv['Bindings'], windowId: string) => {
  const row = await env.USER_DB.prepare(
    `
      SELECT value
      FROM ai_governance_counters
      WHERE scope = ? AND subject = ? AND window_id = ?
    `,
  )
    .bind(DAILY_BUDGET_SCOPE, DAILY_BUDGET_SUBJECT, windowId)
    .first<{ value: number }>();
  return row ? Number(row.value) : null;
};

const isBudgetExceeded = (error: unknown) =>
  error instanceof Error && error.message.includes('BUDGET_EXCEEDED');

export const reserveAIDailyBudget = async (
  env: ApiEnv['Bindings'],
  usageEventId: string,
  estimatedTokens: number,
  limitTokens: number,
) => {
  const windowId = getCurrentUtcDateKey();
  const reservedTokens = Math.max(1, Math.floor(estimatedTokens));

  try {
    await env.USER_DB.prepare(
      `
        INSERT INTO ai_budget_reservations (
          usage_event_id,
          window_id,
          reserved_tokens,
          actual_tokens,
          limit_tokens,
          expires_at,
          settled_at,
          created_at
        )
        VALUES (?, ?, ?, NULL, ?, ?, NULL, ?)
      `,
    )
      .bind(usageEventId, windowId, reservedTokens, limitTokens, getBudgetExpiry(), Date.now())
      .run();
  } catch (error) {
    if (isBudgetExceeded(error)) return null;
    throw error;
  }

  return readBudgetValue(env, windowId);
};

export const settleAIDailyBudget = async (
  env: ApiEnv['Bindings'],
  usageEventId: string,
  actualTokens: number | null,
) => {
  const reservation = await env.USER_DB.prepare(
    `
      UPDATE ai_budget_reservations
      SET
        actual_tokens = COALESCE(?, reserved_tokens),
        settled_at = ?
      WHERE usage_event_id = ? AND actual_tokens IS NULL
      RETURNING window_id AS windowId
    `,
  )
    .bind(
      actualTokens == null ? null : Math.max(0, Math.round(actualTokens)),
      Date.now(),
      usageEventId,
    )
    .first<{ windowId: string }>();

  return reservation ? readBudgetValue(env, reservation.windowId) : null;
};

export const reconcileTerminalAIBudgets = async (env: ApiEnv['Bindings']) => {
  const result = await env.USER_DB.prepare(
    `
      UPDATE ai_budget_reservations
      SET
        actual_tokens = COALESCE(
          (SELECT actual_total_tokens FROM usage_events WHERE id = usage_event_id),
          CASE
          WHEN (
            SELECT status FROM usage_events WHERE id = usage_event_id
          ) = 'succeeded' THEN reserved_tokens
          ELSE 0
          END
        ),
        settled_at = ?
      WHERE actual_tokens IS NULL
        AND usage_event_id IN (
          SELECT id FROM usage_events WHERE status IN ('succeeded', 'failed')
        )
    `,
  )
    .bind(Date.now())
    .run();

  return Number(result.meta.changes ?? 0);
};
