import type { Context } from 'hono';
import { authenticateRequest } from './auth.js';
import { applyCreditMutation, type CreditLedgerSource } from './credits.js';
import type { ApiEnv } from './context.js';

export type AIRouteKey =
  | 'explain'
  | 'review'
  | 'generate-table'
  | 'generate-comments'
  | 'index-advisor';

export type AIUsageReservation<RouteKey extends AIRouteKey = AIRouteKey> = {
  usageEventId: string;
  userId: string;
  routeKey: RouteKey;
  requestId: string;
  reservedTokens: number;
};

type AIUsageTerminalStatus = 'succeeded' | 'failed';

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
    from: string;
    to: string;
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
  const settlingStatus = `settling_${terminalStatus}`;
  const result = await env.USER_DB.prepare(
    `
      UPDATE usage_events
      SET status = ?
      WHERE id = ? AND status IN ('reserved', ?)
    `,
  )
    .bind(settlingStatus, reservation.usageEventId, settlingStatus)
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

    await updateUsageStatus(env, reservation, { from: 'pending', to: 'reserved' });
    return reservation;
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : 'SERVICE_UNAVAILABLE';
    await updateUsageStatus(env, reservation, {
      from: 'pending',
      to: 'failed',
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
    from: 'settling_succeeded',
    to: 'succeeded',
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
    from: 'settling_failed',
    to: 'failed',
    errorCode,
  });
};
