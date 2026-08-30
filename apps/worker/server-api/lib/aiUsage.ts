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
export type AIUsageSettlement = {
  observedTotalTokens: number | null;
  chargedTokens: number;
  providerBudgetTokens: number;
  usageEstimated: boolean;
};
export type PreparedAIUsageSettlement = {
  chargedTokens: number;
  providerBudgetTokens: number;
  needsFinalization: boolean;
};

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
  const amount = Math.max(minimum, Math.ceil(value));
  if (!Number.isFinite(value) || !Number.isSafeInteger(amount)) {
    throw new DomainError(500, 'SERVICE_UNAVAILABLE', 'INVALID_CREDIT_AMOUNT');
  }
  return amount;
};

const normalizeSettlementTokenAmount = (value: number) => {
  if (value < 0 || !Number.isSafeInteger(value)) {
    throw new DomainError(500, 'SERVICE_UNAVAILABLE', 'INVALID_CREDIT_AMOUNT');
  }
  return value;
};

const normalizeSettlement = (settlement: AIUsageSettlement): AIUsageSettlement => {
  if (typeof settlement.usageEstimated !== 'boolean') {
    throw new DomainError(500, 'SERVICE_UNAVAILABLE', 'INVALID_USAGE_MEASUREMENT');
  }
  const observedTotalTokens =
    settlement.observedTotalTokens === null
      ? null
      : normalizeSettlementTokenAmount(settlement.observedTotalTokens);
  const normalized = {
    observedTotalTokens,
    chargedTokens: normalizeSettlementTokenAmount(settlement.chargedTokens),
    providerBudgetTokens: normalizeSettlementTokenAmount(settlement.providerBudgetTokens),
    usageEstimated: settlement.usageEstimated,
  };
  if (
    (!normalized.usageEstimated && normalized.observedTotalTokens === null) ||
    (!normalized.usageEstimated && normalized.observedTotalTokens !== normalized.chargedTokens) ||
    normalized.providerBudgetTokens < normalized.chargedTokens
  ) {
    throw new DomainError(500, 'SERVICE_UNAVAILABLE', 'INVALID_USAGE_MEASUREMENT');
  }
  return normalized;
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
          id, user_id, route_key, request_id, estimated_tokens, status, attempt_count, created_at
        )
        SELECT ?, ?, ?, ?, ?, 'reserved', 0, ? FROM credit_accounts WHERE user_id = ?
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
    if (error instanceof Error && error.message.includes('AI_USAGE_DEBT_PENDING')) {
      throw new DomainError(402, 'CREDIT_EXHAUSTED', 'CREDIT_SETTLEMENT_PENDING');
    }
    throw mapLedgerAbort(error);
  }
};

export const recordAIUsageAttempt = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
) => {
  const row = await env.USER_DB.prepare(`
    UPDATE usage_events
    SET attempt_count = COALESCE(attempt_count, 0) + 1
    WHERE id = ? AND user_id = ? AND status = 'reserved'
    RETURNING attempt_count AS attemptCount
  `)
    .bind(reservation.usageEventId, reservation.userId)
    .first<{ attemptCount: number }>();
  if (!row) {
    throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'AI_USAGE_NOT_RESERVED');
  }
  return Number(row.attemptCount);
};

const getSettlingStatus = (status: AIUsageTerminalStatus) =>
  status === 'succeeded' ? AI_USAGE_STATUS.settlingSucceeded : AI_USAGE_STATUS.settlingFailed;

const isSettlementStatus = (status: AIUsageStatus) =>
  status === AI_USAGE_STATUS.settlingSucceeded ||
  status === AI_USAGE_STATUS.settlingFailed ||
  status === AI_USAGE_STATUS.succeeded ||
  status === AI_USAGE_STATUS.failed;

export const prepareAIUsageSettlement = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  status: AIUsageTerminalStatus,
  input: AIUsageSettlement,
  errorCode: string | null,
  from: AIUsageStatus = AI_USAGE_STATUS.reserved,
): Promise<PreparedAIUsageSettlement> => {
  const settlement = normalizeSettlement(input);
  const settlingStatus = getSettlingStatus(status);
  const isZeroWithoutAttempt =
    settlement.observedTotalTokens === 0 &&
    settlement.chargedTokens === 0 &&
    settlement.providerBudgetTokens === 0 &&
    !settlement.usageEstimated;
  const isZeroFailureWithoutAttempt = status === 'failed' && isZeroWithoutAttempt;

  if (from !== settlingStatus) {
    await env.USER_DB.prepare(`
      UPDATE usage_events SET
        status = ?,
        actual_total_tokens = ?,
        charged_tokens = ?,
        provider_budget_tokens = ?,
        usage_is_estimated = ?,
        error_code = ?
      WHERE id = ? AND user_id = ? AND status = ?
        AND (
          attempt_count IS NULL
          OR (attempt_count = 0 AND ? = 1)
          OR (attempt_count > 0 AND ? = 0)
        )
    `)
      .bind(
        settlingStatus,
        settlement.observedTotalTokens,
        settlement.chargedTokens,
        settlement.providerBudgetTokens,
        settlement.usageEstimated ? 1 : 0,
        errorCode,
        reservation.usageEventId,
        reservation.userId,
        from,
        isZeroWithoutAttempt ? 1 : 0,
        isZeroFailureWithoutAttempt ? 1 : 0,
      )
      .run();
  } else {
    await env.USER_DB.prepare(`
      UPDATE usage_events SET
        actual_total_tokens = COALESCE(actual_total_tokens, ?),
        charged_tokens = COALESCE(charged_tokens, ?),
        provider_budget_tokens = COALESCE(provider_budget_tokens, ?),
        usage_is_estimated = COALESCE(usage_is_estimated, ?),
        error_code = COALESCE(error_code, ?)
      WHERE id = ? AND user_id = ? AND status = ?
        AND (charged_tokens IS NULL OR provider_budget_tokens IS NULL)
    `)
      .bind(
        settlement.observedTotalTokens,
        settlement.chargedTokens,
        settlement.providerBudgetTokens,
        settlement.usageEstimated ? 1 : 0,
        errorCode,
        reservation.usageEventId,
        reservation.userId,
        settlingStatus,
      )
      .run();
  }

  const prepared = await env.USER_DB.prepare(`
    SELECT status, charged_tokens AS chargedTokens,
      provider_budget_tokens AS providerBudgetTokens
    FROM usage_events
    WHERE id = ? AND user_id = ?
  `)
    .bind(reservation.usageEventId, reservation.userId)
    .first<{
      status: AIUsageStatus;
      chargedTokens: number | null;
      providerBudgetTokens: number | null;
    }>();
  if (
    !prepared ||
    !isSettlementStatus(prepared.status) ||
    prepared.chargedTokens === null ||
    prepared.providerBudgetTokens === null
  ) {
    throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'AI_USAGE_SETTLEMENT_NOT_PREPARED');
  }
  return {
    chargedTokens: normalizeSettlementTokenAmount(Number(prepared.chargedTokens)),
    providerBudgetTokens: normalizeSettlementTokenAmount(Number(prepared.providerBudgetTokens)),
    needsFinalization: prepared.status === settlingStatus,
  };
};

export const finalizeAIUsageSettlement = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  status: AIUsageTerminalStatus,
  errorCode: string | null,
) => {
  const settlingStatus = getSettlingStatus(status);
  const ledgerIdentity = `${reservation.usageEventId}:settlement`;
  const metadata = JSON.stringify({
    routeKey: reservation.routeKey,
    requestId: reservation.requestId,
    errorCode,
  });

  try {
    const result = await env.USER_DB.batch([
      env.USER_DB.prepare(`
        INSERT INTO credit_ledger (
          id, user_id, kind, source, amount, balance_after, idempotency_key,
          related_usage_id, metadata_json, created_at
        )
        SELECT ?, u.user_id, 'refund', ?, u.estimated_tokens - u.charged_tokens,
          a.balance + u.estimated_tokens - u.charged_tokens, ?, u.id, ?, ?
        FROM usage_events u JOIN credit_accounts a ON a.user_id = u.user_id
        WHERE u.id = ? AND u.user_id = ? AND u.status = ?
          AND u.charged_tokens IS NOT NULL AND u.estimated_tokens > u.charged_tokens
          AND EXISTS (
            SELECT 1 FROM credit_ledger
            WHERE user_id = u.user_id AND idempotency_key = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM credit_ledger
            WHERE user_id = u.user_id AND idempotency_key = ?
          )
      `).bind(
        `refund:${ledgerIdentity}`,
        ROUTE_SOURCES[reservation.routeKey],
        ledgerIdentity,
        metadata,
        Date.now(),
        reservation.usageEventId,
        reservation.userId,
        settlingStatus,
        `${reservation.usageEventId}:reserve`,
        ledgerIdentity,
      ),
      env.USER_DB.prepare(`
        INSERT INTO credit_ledger (
          id, user_id, kind, source, amount, balance_after, idempotency_key,
          related_usage_id, metadata_json, created_at
        )
        SELECT ?, u.user_id, 'consume', ?, u.charged_tokens - u.estimated_tokens,
          a.balance - (u.charged_tokens - u.estimated_tokens), ?, u.id, ?, ?
        FROM usage_events u JOIN credit_accounts a ON a.user_id = u.user_id
        WHERE u.id = ? AND u.user_id = ? AND u.status = ?
          AND u.charged_tokens IS NOT NULL AND u.estimated_tokens < u.charged_tokens
          AND EXISTS (
            SELECT 1 FROM credit_ledger
            WHERE user_id = u.user_id AND idempotency_key = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM credit_ledger
            WHERE user_id = u.user_id AND idempotency_key = ?
          )
      `).bind(
        `consume:${ledgerIdentity}`,
        ROUTE_SOURCES[reservation.routeKey],
        ledgerIdentity,
        metadata,
        Date.now(),
        reservation.usageEventId,
        reservation.userId,
        settlingStatus,
        `${reservation.usageEventId}:reserve`,
        ledgerIdentity,
      ),
      env.USER_DB.prepare(`
        UPDATE usage_events SET status = ?
        WHERE id = ? AND user_id = ? AND status = ?
          AND (
            charged_tokens = estimated_tokens
            OR (
              charged_tokens = 0
              AND NOT EXISTS (
                SELECT 1 FROM credit_ledger
                WHERE user_id = usage_events.user_id
                  AND idempotency_key = usage_events.id || ':reserve'
              )
            )
            OR EXISTS (
              SELECT 1 FROM credit_ledger
              WHERE user_id = usage_events.user_id
                AND idempotency_key = ?
                AND related_usage_id = usage_events.id
                AND (
                  (
                    usage_events.charged_tokens > usage_events.estimated_tokens
                    AND kind = 'consume'
                    AND amount = usage_events.charged_tokens - usage_events.estimated_tokens
                  )
                  OR (
                    usage_events.charged_tokens < usage_events.estimated_tokens
                    AND kind = 'refund'
                    AND amount = usage_events.estimated_tokens - usage_events.charged_tokens
                  )
                )
            )
          )
        RETURNING id
      `).bind(status, reservation.usageEventId, reservation.userId, settlingStatus, ledgerIdentity),
    ]);
    return result[2].results.length > 0;
  } catch (error) {
    throw mapLedgerAbort(error);
  }
};

const settleUsage = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  status: AIUsageTerminalStatus,
  input: AIUsageSettlement,
  errorCode: string | null,
  from: AIUsageStatus = AI_USAGE_STATUS.reserved,
) => {
  let prepared: PreparedAIUsageSettlement;
  try {
    prepared = await prepareAIUsageSettlement(env, reservation, status, input, errorCode, from);
  } catch (error) {
    if (error instanceof DomainError && error.message === 'AI_USAGE_SETTLEMENT_NOT_PREPARED') {
      return false;
    }
    throw error;
  }
  if (!prepared.needsFinalization) return false;
  return finalizeAIUsageSettlement(env, reservation, status, errorCode);
};

export const completeAIUsage = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  settlement: AIUsageSettlement,
) => {
  await settleUsage(env, reservation, 'succeeded', settlement, null);
};

export const failAIUsage = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  errorCode: string,
  settlement: AIUsageSettlement,
) => {
  await settleUsage(env, reservation, 'failed', settlement, errorCode);
};

const RECLAIMABLE_STATUSES: readonly AIUsageStatus[] = [
  AI_USAGE_STATUS.reserved,
  AI_USAGE_STATUS.pending,
  AI_USAGE_STATUS.reclaiming,
  AI_USAGE_STATUS.settlingSucceeded,
  AI_USAGE_STATUS.settlingFailed,
];
const AI_USAGE_RECOVERY_RETRY_DELAY_MS = 15 * 60 * 1000;

type StaleUsageRow = {
  id: string;
  userId: string;
  routeKey: AIRouteKey;
  requestId: string;
  estimatedTokens: number;
  actualTotalTokens: number | null;
  chargedTokens: number | null;
  providerBudgetTokens: number | null;
  attemptCount: number | null;
  usageEstimated: number | null;
  hasReservationLedger: number;
  status: AIUsageStatus;
  errorCode: string | null;
  createdAt: number;
};

const getRecoveredCharge = (row: StaleUsageRow, attemptCount: number) => {
  if (row.chargedTokens !== null) return row.chargedTokens;
  if (row.status === AI_USAGE_STATUS.pending) return 0;
  if (row.status === AI_USAGE_STATUS.settlingFailed) return row.actualTotalTokens ?? 0;
  if (row.status === AI_USAGE_STATUS.reclaiming) return row.actualTotalTokens ?? 0;
  if (row.status === AI_USAGE_STATUS.settlingSucceeded) {
    return row.actualTotalTokens ?? row.estimatedTokens;
  }
  return (
    row.actualTotalTokens ??
    (attemptCount > 0 && row.hasReservationLedger ? row.estimatedTokens : 0)
  );
};

const addProviderBudgetTokens = (baseTokens: number, attempts: number, reservedTokens: number) => {
  const remaining = Number.MAX_SAFE_INTEGER - baseTokens;
  if (attempts > Math.floor(remaining / reservedTokens)) return Number.MAX_SAFE_INTEGER;
  return baseTokens + attempts * reservedTokens;
};

const getRecoveredProviderBudget = (
  row: StaleUsageRow,
  attemptCount: number,
  chargedTokens: number,
) => {
  if (row.providerBudgetTokens !== null) return row.providerBudgetTokens;
  if (attemptCount === 0) return 0;
  if (row.attemptCount === null) return Math.max(chargedTokens, row.estimatedTokens);
  const observedTokens = row.actualTotalTokens ?? 0;
  const unknownAttempts = row.actualTotalTokens === null ? attemptCount : attemptCount - 1;
  return Math.max(
    chargedTokens,
    addProviderBudgetTokens(observedTokens, unknownAttempts, row.estimatedTokens),
  );
};

export const reclaimStaleAIUsage = async (
  env: ApiEnv['Bindings'],
  options: { now?: number; ttlMs?: number; limit?: number } = {},
) => {
  const ttlMs = options.ttlMs ?? getAIUsageReclaimTtlMs(buildOpenAIConfig(env));
  const now = options.now ?? Date.now();
  const cutoff = now - ttlMs;
  const stale = await env.USER_DB.prepare(`
    SELECT id, user_id AS userId, route_key AS routeKey, request_id AS requestId,
      estimated_tokens AS estimatedTokens, actual_total_tokens AS actualTotalTokens,
      charged_tokens AS chargedTokens, attempt_count AS attemptCount,
      provider_budget_tokens AS providerBudgetTokens,
      usage_is_estimated AS usageEstimated, status, error_code AS errorCode,
      created_at AS createdAt,
      EXISTS (
        SELECT 1 FROM credit_ledger
        WHERE related_usage_id = usage_events.id
          AND idempotency_key = usage_events.id || ':reserve'
      ) AS hasReservationLedger
    FROM usage_events
    WHERE status IN (${RECLAIMABLE_STATUSES.map(() => '?').join(', ')})
      AND (recovery_after IS NULL OR recovery_after <= ?)
      AND (
        status IN ('settling_succeeded', 'settling_failed')
        OR created_at < ?
      )
    ORDER BY
      CASE
        WHEN recovery_after IS NOT NULL THEN recovery_after
        WHEN status IN ('settling_succeeded', 'settling_failed') THEN created_at
        ELSE created_at + ?
      END,
      created_at,
      id
    LIMIT ?
  `)
    .bind(...RECLAIMABLE_STATUSES, now, cutoff, ttlMs, options.limit ?? 200)
    .all<StaleUsageRow>();
  let reclaimed = 0;
  const failures: Array<{ usageEventId: string; error: unknown }> = [];
  const deferRecovery = (usageEventId: string) =>
    env.USER_DB.prepare(`
      UPDATE usage_events SET recovery_after = ?
      WHERE id = ? AND status IN (${RECLAIMABLE_STATUSES.map(() => '?').join(', ')})
    `)
      .bind(now + AI_USAGE_RECOVERY_RETRY_DELAY_MS, usageEventId, ...RECLAIMABLE_STATUSES)
      .run();
  for (const row of stale.results) {
    if (!(row.routeKey in ROUTE_SOURCES)) {
      const error = new Error('UNKNOWN_AI_ROUTE');
      failures.push({ usageEventId: row.id, error });
      await deferRecovery(row.id);
      continue;
    }
    try {
      const succeeded = row.status === AI_USAGE_STATUS.settlingSucceeded;
      const attemptCount =
        row.attemptCount ??
        (row.status === AI_USAGE_STATUS.pending ? 0 : row.hasReservationLedger ? 1 : 0);
      const chargedTokens = getRecoveredCharge(row, attemptCount);
      const providerBudgetTokens = getRecoveredProviderBudget(row, attemptCount, chargedTokens);
      const usageEstimated =
        row.usageEstimated === null
          ? attemptCount === 0 && chargedTokens === 0
            ? false
            : row.attemptCount === null ||
              row.actualTotalTokens === null ||
              row.actualTotalTokens !== chargedTokens
          : row.usageEstimated === 1;
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
        {
          observedTotalTokens:
            row.actualTotalTokens ?? (attemptCount === 0 && chargedTokens === 0 ? 0 : null),
          chargedTokens,
          providerBudgetTokens,
          usageEstimated,
        },
        succeeded ? null : (row.errorCode ?? 'RESERVATION_ABANDONED'),
        row.status,
      );
      if (!changed) {
        const current = await env.USER_DB.prepare(
          'SELECT status FROM usage_events WHERE id = ? AND user_id = ?',
        )
          .bind(row.id, row.userId)
          .first<{ status: string }>();
        if (current && isTerminalAIUsageStatus(current.status)) continue;
        throw new Error('AI_USAGE_SETTLEMENT_INCOMPLETE');
      }
      reclaimed += 1;
    } catch (error) {
      failures.push({ usageEventId: row.id, error });
      await deferRecovery(row.id);
    }
  }
  return { scanned: stale.results.length, reclaimed, failures };
};
