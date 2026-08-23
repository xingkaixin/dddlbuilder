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
 * 任何非终态 → reclaiming：回收器抢占；reclaiming → failed：退款完成。
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

const encodeIdentityPart = (value: string) => `${value.length}:${value}`;

const buildUsageEventId = (userId: string, routeKey: AIRouteKey, requestId: string) =>
  `usage:${encodeIdentityPart(userId)}:${encodeIdentityPart(routeKey)}:${encodeIdentityPart(requestId)}`;

const buildLedgerIdentity = (reservation: AIUsageReservation, phase: 'reserve' | 'settlement') =>
  `${reservation.usageEventId}:${phase}`;

const normalizeTokenAmount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.max(1, Math.round(value));
};

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
      ON CONFLICT(user_id, route_key, request_id) DO NOTHING
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

  if (!result.success || Number(result.meta.changes ?? 0) === 0) {
    throw new Error('AI_USAGE_REPLAYED');
  }
};

const updateUsageStatus = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  input: {
    from: AIUsageStatus;
    to: AIUsageStatus;
    actualTotalTokens?: number | null;
    errorCode?: string | null;
  },
) =>
  env.USER_DB.prepare(
    `
      UPDATE usage_events
      SET status = ?, actual_total_tokens = ?, error_code = ?
      WHERE id = ? AND status = ?
    `,
  )
    .bind(
      input.to,
      input.actualTotalTokens ?? null,
      input.errorCode ?? null,
      reservation.usageEventId,
      input.from,
    )
    .run();

const claimSettlement = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  terminalStatus: AIUsageTerminalStatus,
) => {
  const settlingStatus =
    terminalStatus === 'succeeded'
      ? AI_USAGE_STATUS.settlingSucceeded
      : AI_USAGE_STATUS.settlingFailed;
  const result = await env.USER_DB.prepare(
    `
      UPDATE usage_events
      SET status = ?
      WHERE id = ? AND status IN (?, ?)
    `,
  )
    .bind(settlingStatus, reservation.usageEventId, AI_USAGE_STATUS.reserved, settlingStatus)
    .run();
  return result.success && Number(result.meta.changes ?? 0) > 0;
};

export const authenticateAIUser = async (c: Context<ApiEnv>) => {
  return authenticateRequest(c);
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
    usageEventId: buildUsageEventId(input.userId, input.routeKey, input.requestId),
    userId: input.userId,
    routeKey: input.routeKey,
    requestId: input.requestId,
    reservedTokens: normalizeTokenAmount(input.estimatedTokens),
  };

  await createUsageEvent(env, reservation);

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

    await updateUsageStatus(env, reservation, {
      from: AI_USAGE_STATUS.pending,
      to: AI_USAGE_STATUS.reserved,
    });
    return reservation;
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : 'SERVICE_UNAVAILABLE';
    await updateUsageStatus(env, reservation, {
      from: AI_USAGE_STATUS.pending,
      to: AI_USAGE_STATUS.failed,
      errorCode,
    });
    throw error;
  }
};

export const completeAIUsage = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  actualTotalTokens: number | null,
) => {
  if (!(await claimSettlement(env, reservation, 'succeeded'))) {
    return;
  }

  const actualTokens =
    actualTotalTokens == null
      ? reservation.reservedTokens
      : Math.max(0, Math.round(actualTotalTokens));
  const tokenDelta = reservation.reservedTokens - actualTokens;

  if (tokenDelta !== 0) {
    const kind = tokenDelta > 0 ? 'refund' : 'consume';
    const amount = Math.abs(tokenDelta);
    const ledgerIdentity = buildLedgerIdentity(reservation, 'settlement');
    await applyCreditMutation(env, {
      userId: reservation.userId,
      kind,
      source: ROUTE_SOURCES[reservation.routeKey],
      amount,
      idempotencyKey: ledgerIdentity,
      relatedUsageId: reservation.usageEventId,
      metadata: {
        routeKey: reservation.routeKey,
        requestId: reservation.requestId,
        reason: tokenDelta > 0 ? 'actual_less_than_reserved' : 'actual_exceeded_reserved',
      },
      ledgerId: `${kind}:${ledgerIdentity}`,
    });
  }

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
  if (!(await claimSettlement(env, reservation, 'failed'))) {
    return;
  }

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
      reason: 'request_failed',
      errorCode,
    },
    ledgerId: `refund:${ledgerIdentity}`,
  });

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
  status: string;
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
  return result.success && Number(result.meta.changes ?? 0) > 0;
};

const reclaimOne = async (env: ApiEnv['Bindings'], row: StaleUsageRow) => {
  if (!isAIRouteKey(row.routeKey)) return false;
  if (!(await claimStaleUsage(env, row))) return false;

  const reservation: AIUsageReservation = {
    usageEventId: row.id,
    userId: row.userId,
    routeKey: row.routeKey,
    requestId: row.requestId,
    reservedTokens: normalizeTokenAmount(row.estimatedTokens),
  };

  // pending 记录的扣款未必发生过，退款前必须先确认预留分录真的存在
  const reserved = await readCreditLedgerEntry(
    env,
    row.userId,
    buildLedgerIdentity(reservation, 'reserve'),
  );
  if (reserved) {
    await applyCreditMutation(env, {
      userId: row.userId,
      kind: 'refund',
      source: ROUTE_SOURCES[row.routeKey],
      amount: reservation.reservedTokens,
      idempotencyKey: buildLedgerIdentity(reservation, 'settlement'),
      relatedUsageId: row.id,
      metadata: {
        routeKey: row.routeKey,
        requestId: row.requestId,
        reason: 'reservation_abandoned',
        reclaimedFrom: row.status,
      },
      ledgerId: `refund:${buildLedgerIdentity(reservation, 'settlement')}`,
    });
  }

  await env.USER_DB.prepare(
    `
      UPDATE usage_events
      SET status = 'failed', error_code = 'RESERVATION_ABANDONED'
      WHERE id = ? AND status = 'reclaiming'
    `,
  )
    .bind(row.id)
    .run();
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
        status
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
