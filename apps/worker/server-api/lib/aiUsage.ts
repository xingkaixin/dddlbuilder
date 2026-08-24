import type { Context } from 'hono';
import { authenticateRequest } from './auth.js';
import { applyCreditMutation, readCreditLedgerEntry, type CreditLedgerSource } from './credits.js';
import type { ApiEnv } from './context.js';
import type { AIRouteKey } from './aiRouteKey.js';

export type { AIRouteKey } from './aiRouteKey.js';

export type AIUsageReservation<RouteKey extends AIRouteKey = AIRouteKey> = {
  usageEventId: string;
  userId: string;
  routeKey: RouteKey;
  requestId: string;
  reservedTokens: number;
};

type AIUsageTerminalStatus = 'succeeded' | 'failed';

/**
 * usage_events.status 的显式状态机。
 * pending → reserved：预留分录落账后；
 * reserved/settling_* → settling_{terminal}：正常结算抢占（幂等，只允许一个终态）；
 * pending/reserved → reclaiming：回收器抢占废弃预留；
 * settling_* 由回收器按已记录的结算意图续跑到对应终态。
 */
export const AI_USAGE_STATUS = {
  pending: 'pending',
  reserved: 'reserved',
  settlingSucceeded: 'settling_succeeded',
  settlingFailed: 'settling_failed',
  succeeded: 'succeeded',
  failed: 'failed',
  reclaiming: 'reclaiming',
} as const;

export type AIUsageStatus = (typeof AI_USAGE_STATUS)[keyof typeof AI_USAGE_STATUS];

const TERMINAL_STATUSES: readonly AIUsageStatus[] = [
  AI_USAGE_STATUS.succeeded,
  AI_USAGE_STATUS.failed,
];

export const isTerminalAIUsageStatus = (status: string): status is AIUsageStatus =>
  TERMINAL_STATUSES.includes(status as AIUsageStatus);

const ROUTE_SOURCES: Record<AIRouteKey, CreditLedgerSource> = {
  explain: 'ai_explain',
  review: 'ai_review',
  'generate-table': 'ai_generate',
  'generate-comments': 'ai_generate',
  'index-advisor': 'ai_generate',
};

const createUsageEventId = () => `usage:${crypto.randomUUID()}`;

const buildLedgerIdentity = (reservation: AIUsageReservation, phase: 'reserve' | 'settlement') =>
  `${reservation.usageEventId}:${phase}`;

const normalizeTokenAmount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.max(1, Math.round(value));
};

const changedRows = (result: D1Result<unknown>) => Number(result.meta.changes ?? 0);

const createUsageEvent = async (env: ApiEnv['Bindings'], reservation: AIUsageReservation) => {
  const result = await env.USER_DB.prepare(
    `
      INSERT INTO usage_events (
        id,
        user_id,
        route_key,
        request_id,
        estimated_tokens,
        actual_total_tokens,
        status,
        error_code
      )
      VALUES (?, ?, ?, ?, ?, NULL, 'pending', NULL)
    `,
  )
    .bind(
      reservation.usageEventId,
      reservation.userId,
      reservation.routeKey,
      reservation.requestId,
      reservation.reservedTokens,
    )
    .run();

  if (!result.success || Number(result.meta.changes ?? 0) !== 1) {
    console.error('[ai-usage] event creation failed', {
      usageEventId: reservation.usageEventId,
      requestId: reservation.requestId,
      routeKey: reservation.routeKey,
    });
    throw new Error('AI_USAGE_CREATE_FAILED');
  }
};

const updateUsageStatus = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  input: {
    from: AIUsageStatus | readonly AIUsageStatus[];
    to: AIUsageStatus;
    actualTotalTokens?: number | null;
    errorCode?: string | null;
  },
) => {
  const fromStatuses = Array.isArray(input.from) ? input.from : [input.from];
  const placeholders = fromStatuses.map(() => '?').join(', ');
  const result = await env.USER_DB.prepare(
    `
      UPDATE usage_events
      SET status = ?, actual_total_tokens = ?, error_code = ?
      WHERE id = ? AND status IN (${placeholders})
    `,
  )
    .bind(
      input.to,
      input.actualTotalTokens ?? null,
      input.errorCode ?? null,
      reservation.usageEventId,
      ...fromStatuses,
    )
    .run();

  if (!result.success || changedRows(result) !== 1) {
    console.error('[ai-usage] status transition rejected', {
      usageEventId: reservation.usageEventId,
      from: fromStatuses,
      to: input.to,
      success: result.success,
      changes: changedRows(result),
    });
    throw new Error('AI_USAGE_STATUS_TRANSITION_FAILED');
  }
};

const claimSettlement = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  terminalStatus: AIUsageTerminalStatus,
  actualTotalTokens: number | null,
  errorCode: string | null,
) => {
  const settlingStatus =
    terminalStatus === 'succeeded'
      ? AI_USAGE_STATUS.settlingSucceeded
      : AI_USAGE_STATUS.settlingFailed;
  const result = await env.USER_DB.prepare(
    `
      UPDATE usage_events
      SET
        status = ?,
        actual_total_tokens = COALESCE(actual_total_tokens, ?),
        error_code = COALESCE(error_code, ?)
      WHERE id = ?
        AND (
          status = ?
          OR (
            status = ?
            AND actual_total_tokens IS ?
            AND error_code IS ?
          )
        )
    `,
  )
    .bind(
      settlingStatus,
      actualTotalTokens,
      errorCode,
      reservation.usageEventId,
      AI_USAGE_STATUS.reserved,
      settlingStatus,
      actualTotalTokens,
      errorCode,
    )
    .run();
  if (!result.success) {
    console.error('[ai-usage] settlement claim failed', {
      usageEventId: reservation.usageEventId,
      terminalStatus,
    });
    throw new Error('AI_USAGE_SETTLEMENT_CLAIM_FAILED');
  }
  return changedRows(result) > 0;
};

export const authenticateAIUser = async (c: Context<ApiEnv>) => {
  return authenticateRequest(c);
};

const applyFailedSettlement = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  errorCode: string,
  reason: 'request_failed' | 'reservation_failed' | 'reservation_abandoned',
) => {
  const ledgerIdentity = buildLedgerIdentity(reservation, 'settlement');
  await applyCreditMutation(env, {
    userId: reservation.userId,
    kind: 'refund',
    source: ROUTE_SOURCES[reservation.routeKey],
    amount: reservation.reservedTokens,
    idempotencyKey: ledgerIdentity,
    relatedUsageId: reservation.usageEventId,
    metadata: {
      routeKey: reservation.routeKey,
      requestId: reservation.requestId,
      reason,
      errorCode,
    },
    ledgerId: `refund:${ledgerIdentity}`,
  });
};

const applySuccessfulSettlement = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  actualTokens: number,
) => {
  const tokenDelta = reservation.reservedTokens - actualTokens;
  if (tokenDelta === 0) return;

  const kind = tokenDelta > 0 ? 'refund' : 'consume';
  const ledgerIdentity = buildLedgerIdentity(reservation, 'settlement');
  await applyCreditMutation(env, {
    userId: reservation.userId,
    kind,
    source: ROUTE_SOURCES[reservation.routeKey],
    amount: Math.abs(tokenDelta),
    idempotencyKey: ledgerIdentity,
    relatedUsageId: reservation.usageEventId,
    metadata: {
      routeKey: reservation.routeKey,
      requestId: reservation.requestId,
      reason: tokenDelta > 0 ? 'actual_less_than_reserved' : 'actual_exceeded_reserved',
    },
    ledgerId: `${kind}:${ledgerIdentity}`,
  });
};

const recoverReservationFailure = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  errorCode: string,
  creditReserved: boolean,
) => {
  const reserveLedger = creditReserved
    ? true
    : Boolean(
        await readCreditLedgerEntry(
          env,
          reservation.userId,
          buildLedgerIdentity(reservation, 'reserve'),
        ),
      );

  if (reserveLedger) {
    await applyFailedSettlement(env, reservation, errorCode, 'reservation_failed');
  }

  await updateUsageStatus(env, reservation, {
    from: [AI_USAGE_STATUS.pending, AI_USAGE_STATUS.reserved],
    to: AI_USAGE_STATUS.failed,
    errorCode,
  });
};

export const reserveAIUsage = async <RouteKey extends AIRouteKey>(
  env: ApiEnv['Bindings'],
  input: {
    userId: string;
    routeKey: RouteKey;
    requestId: string;
    estimatedTokens: number;
  },
): Promise<AIUsageReservation<RouteKey>> => {
  const reservation: AIUsageReservation<RouteKey> = {
    usageEventId: createUsageEventId(),
    userId: input.userId,
    routeKey: input.routeKey,
    requestId: input.requestId,
    reservedTokens: normalizeTokenAmount(input.estimatedTokens),
  };

  await createUsageEvent(env, reservation);

  let creditReserved = false;
  try {
    const ledgerIdentity = buildLedgerIdentity(reservation, 'reserve');
    await applyCreditMutation(env, {
      userId: input.userId,
      kind: 'consume',
      source: ROUTE_SOURCES[input.routeKey],
      amount: reservation.reservedTokens,
      idempotencyKey: ledgerIdentity,
      relatedUsageId: reservation.usageEventId,
      metadata: {
        routeKey: input.routeKey,
        requestId: input.requestId,
      },
      ledgerId: `consume:${ledgerIdentity}`,
    });
    creditReserved = true;

    await updateUsageStatus(env, reservation, {
      from: AI_USAGE_STATUS.pending,
      to: AI_USAGE_STATUS.reserved,
    });
    return reservation;
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : 'SERVICE_UNAVAILABLE';
    try {
      await recoverReservationFailure(env, reservation, errorCode, creditReserved);
    } catch (recoveryError) {
      console.error('[ai-usage] reservation recovery failed', {
        usageEventId: reservation.usageEventId,
        recoveryError,
      });
    }
    throw error;
  }
};

export const completeAIUsage = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  actualTotalTokens: number | null,
) => {
  const actualTokens =
    actualTotalTokens == null
      ? reservation.reservedTokens
      : Math.max(0, Math.round(actualTotalTokens));
  if (!(await claimSettlement(env, reservation, 'succeeded', actualTokens, null))) {
    return;
  }

  await applySuccessfulSettlement(env, reservation, actualTokens);

  await updateUsageStatus(env, reservation, {
    from: AI_USAGE_STATUS.settlingSucceeded,
    to: AI_USAGE_STATUS.succeeded,
    actualTotalTokens: actualTokens,
  });
};

export const failAIUsage = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  errorCode: string,
) => {
  if (!(await claimSettlement(env, reservation, 'failed', null, errorCode))) {
    return;
  }

  await applyFailedSettlement(env, reservation, errorCode, 'request_failed');

  await updateUsageStatus(env, reservation, {
    from: AI_USAGE_STATUS.settlingFailed,
    to: AI_USAGE_STATUS.failed,
    errorCode,
  });
};

/**
 * Worker 可能在预留和结算之间消失（isolate 回收、CPU 超限、流式请求中断），
 * 此时额度已扣但 usage_event 停在非终态，用户余额被永久占用且没有任何请求会再碰它。
 * 这里按 ledger 里的事实——而不是状态列——决定是否退款，然后把记录推到终态。
 */
const STALE_AI_USAGE_TTL_MS = 15 * 60 * 1000;

// 含 reclaiming：上一轮抢占后中途失败的记录必须能被下一轮重新捡起，否则会永久卡住。
// 重复捡起是安全的——退款走 settlement 幂等键，第二次只会读回已有分录。
const RECLAIMABLE_STATUSES: readonly AIUsageStatus[] = [
  AI_USAGE_STATUS.pending,
  AI_USAGE_STATUS.reserved,
  AI_USAGE_STATUS.reclaiming,
  AI_USAGE_STATUS.settlingSucceeded,
  AI_USAGE_STATUS.settlingFailed,
];

type StaleUsageRow = {
  id: string;
  userId: string;
  routeKey: string;
  requestId: string;
  estimatedTokens: number;
  actualTotalTokens: number | null;
  status: string;
  errorCode: string | null;
};

const isAIRouteKey = (value: string): value is AIRouteKey => value in ROUTE_SOURCES;

/**
 * 抢占先于退款：正常结算路径的 claimSettlement 只认 reserved/settling_*，
 * 状态一旦变成 reclaiming 它就会直接放弃，两条路径不会同时动同一笔额度。
 */
const claimStaleUsage = async (env: ApiEnv['Bindings'], row: StaleUsageRow) => {
  const result = await env.USER_DB.prepare(
    `
      UPDATE usage_events
      SET status = 'reclaiming'
      WHERE id = ? AND status = ?
    `,
  )
    .bind(row.id, row.status)
    .run();
  if (!result.success) {
    throw new Error('AI_USAGE_RECLAIM_CLAIM_FAILED');
  }
  return changedRows(result) > 0;
};

const reclaimOne = async (env: ApiEnv['Bindings'], row: StaleUsageRow) => {
  if (!isAIRouteKey(row.routeKey)) return false;

  const reservation: AIUsageReservation = {
    usageEventId: row.id,
    userId: row.userId,
    routeKey: row.routeKey,
    requestId: row.requestId,
    reservedTokens: normalizeTokenAmount(row.estimatedTokens),
  };

  if (row.status === AI_USAGE_STATUS.settlingSucceeded) {
    const actualTokens = Math.max(
      0,
      Math.round(row.actualTotalTokens ?? reservation.reservedTokens),
    );
    await applySuccessfulSettlement(env, reservation, actualTokens);
    await updateUsageStatus(env, reservation, {
      from: AI_USAGE_STATUS.settlingSucceeded,
      to: AI_USAGE_STATUS.succeeded,
      actualTotalTokens: actualTokens,
    });
    return true;
  }

  if (row.status === AI_USAGE_STATUS.settlingFailed) {
    const errorCode = row.errorCode ?? 'RESERVATION_ABANDONED';
    await applyFailedSettlement(env, reservation, errorCode, 'request_failed');
    await updateUsageStatus(env, reservation, {
      from: AI_USAGE_STATUS.settlingFailed,
      to: AI_USAGE_STATUS.failed,
      errorCode,
    });
    return true;
  }

  if (!(await claimStaleUsage(env, row))) return false;

  const reserved = await readCreditLedgerEntry(
    env,
    row.userId,
    buildLedgerIdentity(reservation, 'reserve'),
  );
  if (reserved) {
    const settled = await readCreditLedgerEntry(
      env,
      row.userId,
      buildLedgerIdentity(reservation, 'settlement'),
    );
    if (!settled) {
      await applyFailedSettlement(
        env,
        reservation,
        'RESERVATION_ABANDONED',
        'reservation_abandoned',
      );
    }
  }

  await updateUsageStatus(env, reservation, {
    from: AI_USAGE_STATUS.reclaiming,
    to: AI_USAGE_STATUS.failed,
    errorCode: 'RESERVATION_ABANDONED',
  });
  return true;
};

export const reclaimStaleAIUsage = async (
  env: ApiEnv['Bindings'],
  options: { now?: number; ttlMs?: number; limit?: number } = {},
) => {
  const ttlMs = options.ttlMs ?? STALE_AI_USAGE_TTL_MS;
  const cutoff = new Date((options.now ?? Date.now()) - ttlMs).toISOString();
  const placeholders = RECLAIMABLE_STATUSES.map(() => '?').join(', ');

  const stale = await env.USER_DB.prepare(
    `
      SELECT
        id,
        user_id AS userId,
        route_key AS routeKey,
        request_id AS requestId,
        estimated_tokens AS estimatedTokens,
        actual_total_tokens AS actualTotalTokens,
        status,
        error_code AS errorCode
      FROM usage_events
      WHERE status IN (${placeholders}) AND created_at < ?
      ORDER BY created_at
      LIMIT ?
    `,
  )
    .bind(...RECLAIMABLE_STATUSES, cutoff, options.limit ?? 200)
    .all<StaleUsageRow>();

  const rows = stale.results ?? [];
  let reclaimed = 0;
  for (const row of rows) {
    try {
      if (await reclaimOne(env, row)) reclaimed += 1;
    } catch (error) {
      // 单条失败不拖垮整批，记录留在 reclaiming 等下一轮重试
      console.error('[ai-usage] failed to reclaim abandoned reservation', row.id, error);
    }
  }
  return { scanned: rows.length, reclaimed };
};
