import { mapLedgerAbort, prepareCreditMutation, type CreditLedgerSource } from './credits.js';
import type { ApiEnv } from './context.js';
import type { AIRouteKey } from './aiRouteKey.js';
import { buildOpenAIConfig, getAIUsageReclaimTtlMs } from './openaiConfig.js';
import { DomainError } from './http.js';

export type { AIRouteKey } from './aiRouteKey.js';

export type AIUsageReservation<RouteKey extends AIRouteKey = AIRouteKey> = {
  usageEventId: string;
  userId: string;
  routeKey: RouteKey;
  requestId: string;
  reservedTokens: number;
};

type AIUsageTerminalStatus = 'succeeded' | 'failed';
export const AI_USAGE_STATUS = {
  reserved: 'reserved',
  succeeded: 'succeeded',
  failed: 'failed',
  // Existing records from before atomic settlement remain recoverable.
  pending: 'pending',
  settlingSucceeded: 'settling_succeeded',
  settlingFailed: 'settling_failed',
  reclaiming: 'reclaiming',
} as const;
export type AIUsageStatus = (typeof AI_USAGE_STATUS)[keyof typeof AI_USAGE_STATUS];
export const isTerminalAIUsageStatus = (status: string): status is AIUsageTerminalStatus =>
  status === 'succeeded' || status === 'failed';

const ROUTE_SOURCES: Record<AIRouteKey, CreditLedgerSource> = {
  explain: 'ai_explain',
  review: 'ai_review',
  'generate-table': 'ai_generate',
  'generate-comments': 'ai_generate',
  'index-advisor': 'ai_generate',
};

const normalizeTokenAmount = (value: number, minimum = 0) => {
  const amount = Math.max(minimum, Math.round(value));
  if (!Number.isFinite(value) || !Number.isSafeInteger(amount)) {
    throw new DomainError(500, 'SERVICE_UNAVAILABLE', 'INVALID_CREDIT_AMOUNT');
  }
  return amount;
};

export const reserveAIUsage = async <RouteKey extends AIRouteKey>(
  env: ApiEnv['Bindings'],
  input: { userId: string; routeKey: RouteKey; requestId: string; estimatedTokens: number },
): Promise<AIUsageReservation<RouteKey>> => {
  const reservation: AIUsageReservation<RouteKey> = {
    usageEventId: `usage:${crypto.randomUUID()}`,
    userId: input.userId,
    routeKey: input.routeKey,
    requestId: input.requestId,
    reservedTokens: normalizeTokenAmount(input.estimatedTokens, 1),
  };
  const ledgerIdentity = `${reservation.usageEventId}:reserve`;
  try {
    const result = await env.USER_DB.batch([
      env.USER_DB.prepare(`
        INSERT INTO usage_events (
          id, user_id, route_key, request_id, estimated_tokens, status, created_at
        )
        SELECT ?, ?, ?, ?, ?, 'reserved', ? FROM credit_accounts WHERE user_id = ?
        RETURNING id
      `).bind(
        reservation.usageEventId,
        input.userId,
        input.routeKey,
        input.requestId,
        reservation.reservedTokens,
        Date.now(),
        input.userId,
      ),
      prepareCreditMutation(env, {
        userId: input.userId,
        kind: 'consume',
        source: ROUTE_SOURCES[input.routeKey],
        amount: reservation.reservedTokens,
        idempotencyKey: ledgerIdentity,
        relatedUsageId: reservation.usageEventId,
        metadata: { routeKey: input.routeKey, requestId: input.requestId },
      }),
    ]);
    if (!result[0]?.results.length) {
      throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'CREDIT_ACCOUNT_MISSING');
    }
    return reservation;
  } catch (error) {
    throw mapLedgerAbort(error);
  }
};

const settleUsage = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  status: AIUsageTerminalStatus,
  actualTokens: number | null,
  errorCode: string | null,
  from: AIUsageStatus = AI_USAGE_STATUS.reserved,
) => {
  const ledgerIdentity = `${reservation.usageEventId}:settlement`;
  const result = await env.USER_DB.batch([
    env.USER_DB.prepare(`
      INSERT INTO credit_ledger (
        id, user_id, kind, source, amount, balance_after, idempotency_key,
        related_usage_id, metadata_json, created_at
      )
      SELECT ?, u.user_id, 'refund', ?, u.estimated_tokens - ?,
        a.balance + u.estimated_tokens - ?, ?, u.id, ?, ?
      FROM usage_events u JOIN credit_accounts a ON a.user_id = u.user_id
      WHERE u.id = ? AND u.user_id = ? AND u.status = ? AND u.estimated_tokens > ?
        AND EXISTS (SELECT 1 FROM credit_ledger WHERE user_id = u.user_id AND idempotency_key = ?)
        AND NOT EXISTS (SELECT 1 FROM credit_ledger WHERE user_id = u.user_id AND idempotency_key = ?)
    `).bind(
      `refund:${ledgerIdentity}`,
      ROUTE_SOURCES[reservation.routeKey],
      actualTokens ?? 0,
      actualTokens ?? 0,
      ledgerIdentity,
      JSON.stringify({
        routeKey: reservation.routeKey,
        requestId: reservation.requestId,
        errorCode,
      }),
      Date.now(),
      reservation.usageEventId,
      reservation.userId,
      from,
      actualTokens ?? 0,
      `${reservation.usageEventId}:reserve`,
      ledgerIdentity,
    ),
    env.USER_DB.prepare(`
      UPDATE usage_events SET status = ?, actual_total_tokens = ?, error_code = ?
      WHERE id = ? AND user_id = ? AND status = ? RETURNING id
    `).bind(status, actualTokens, errorCode, reservation.usageEventId, reservation.userId, from),
  ]);
  return result[1].results.length > 0;
};

export const completeAIUsage = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  actualTotalTokens: number | null,
) => {
  await settleUsage(
    env,
    reservation,
    'succeeded',
    normalizeTokenAmount(actualTotalTokens ?? reservation.reservedTokens),
    null,
  );
};

export const failAIUsage = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  errorCode: string,
  actualTotalTokens: number | null = null,
) => {
  await settleUsage(
    env,
    reservation,
    'failed',
    actualTotalTokens === null ? null : normalizeTokenAmount(actualTotalTokens),
    errorCode,
  );
};

const RECLAIMABLE_STATUSES: readonly AIUsageStatus[] = [
  AI_USAGE_STATUS.reserved,
  AI_USAGE_STATUS.pending,
  AI_USAGE_STATUS.reclaiming,
  AI_USAGE_STATUS.settlingSucceeded,
  AI_USAGE_STATUS.settlingFailed,
];

type StaleUsageRow = {
  id: string;
  userId: string;
  routeKey: AIRouteKey;
  requestId: string;
  estimatedTokens: number;
  actualTotalTokens: number | null;
  status: AIUsageStatus;
  errorCode: string | null;
};

export const reclaimStaleAIUsage = async (
  env: ApiEnv['Bindings'],
  options: { now?: number; ttlMs?: number; limit?: number } = {},
) => {
  const ttlMs = options.ttlMs ?? getAIUsageReclaimTtlMs(buildOpenAIConfig(env));
  const cutoff = (options.now ?? Date.now()) - ttlMs;
  const stale = await env.USER_DB.prepare(`
    SELECT id, user_id AS userId, route_key AS routeKey, request_id AS requestId,
      estimated_tokens AS estimatedTokens, actual_total_tokens AS actualTotalTokens,
      status, error_code AS errorCode
    FROM usage_events WHERE status IN (${RECLAIMABLE_STATUSES.map(() => '?').join(', ')})
      AND created_at < ? ORDER BY created_at LIMIT ?
  `)
    .bind(...RECLAIMABLE_STATUSES, cutoff, options.limit ?? 200)
    .all<StaleUsageRow>();
  let reclaimed = 0;
  for (const row of stale.results) {
    if (!(row.routeKey in ROUTE_SOURCES)) continue;
    try {
      const succeeded = row.status === AI_USAGE_STATUS.settlingSucceeded;
      // An abandoned reserved request may have reached the upstream; retain its charge.
      const actualTokens =
        row.actualTotalTokens ??
        (row.status === AI_USAGE_STATUS.pending || row.status === AI_USAGE_STATUS.settlingFailed
          ? 0
          : row.estimatedTokens);
      const changed = await settleUsage(
        env,
        {
          usageEventId: row.id,
          userId: row.userId,
          routeKey: row.routeKey,
          requestId: row.requestId,
          reservedTokens: row.estimatedTokens,
        },
        succeeded ? 'succeeded' : 'failed',
        normalizeTokenAmount(actualTokens),
        succeeded ? null : (row.errorCode ?? 'RESERVATION_ABANDONED'),
        row.status,
      );
      if (changed) reclaimed += 1;
    } catch (error) {
      console.error('[ai-usage] failed to reclaim abandoned reservation', row.id, error);
    }
  }
  return { scanned: stale.results.length, reclaimed };
};
