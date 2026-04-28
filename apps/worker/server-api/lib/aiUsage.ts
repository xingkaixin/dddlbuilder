import type { Context } from 'hono';
import { authenticateRequest } from './auth.js';
import { applyCreditMutation, type CreditLedgerSource } from './credits.js';
import type { ApiEnv } from './context.js';

export type AIRouteKey = 'explain' | 'review' | 'generate-table' | 'generate-comments';

export type AIUsageReservation = {
  usageEventId: string;
  userId: string;
  routeKey: AIRouteKey;
  requestId: string;
  reservedTokens: number;
};

const ROUTE_SOURCES: Record<AIRouteKey, CreditLedgerSource> = {
  explain: 'ai_explain',
  review: 'ai_review',
  'generate-table': 'ai_generate',
  'generate-comments': 'ai_generate',
};

const buildUsageEventId = (requestId: string) => `usage:${requestId}`;

const normalizeTokenAmount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.max(1, Math.round(value));
};

const writeUsageEvent = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  status: string,
  actualTotalTokens: number | null,
  errorCode: string | null,
) => {
  await env.USER_DB.prepare(
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(request_id) DO UPDATE SET
        user_id = excluded.user_id,
        route_key = excluded.route_key,
        estimated_tokens = excluded.estimated_tokens,
        actual_total_tokens = excluded.actual_total_tokens,
        status = excluded.status,
        error_code = excluded.error_code
    `,
  )
    .bind(
      reservation.usageEventId,
      reservation.userId,
      reservation.routeKey,
      reservation.requestId,
      reservation.reservedTokens,
      actualTotalTokens,
      status,
      errorCode,
    )
    .run();
};

export const authenticateAIUser = async (c: Context<ApiEnv>) => {
  return authenticateRequest(c);
};

export const reserveAIUsage = async (
  env: ApiEnv['Bindings'],
  input: {
    userId: string;
    routeKey: AIRouteKey;
    requestId: string;
    estimatedTokens: number;
  },
): Promise<AIUsageReservation> => {
  const reservation: AIUsageReservation = {
    usageEventId: buildUsageEventId(input.requestId),
    userId: input.userId,
    routeKey: input.routeKey,
    requestId: input.requestId,
    reservedTokens: normalizeTokenAmount(input.estimatedTokens),
  };

  await writeUsageEvent(env, reservation, 'pending', null, null);

  try {
    await applyCreditMutation(env, {
      userId: input.userId,
      kind: 'consume',
      source: ROUTE_SOURCES[input.routeKey],
      amount: reservation.reservedTokens,
      idempotencyKey: `${input.requestId}:reserve`,
      relatedUsageId: reservation.usageEventId,
      metadata: {
        routeKey: input.routeKey,
        requestId: input.requestId,
      },
      ledgerId: `consume:${input.requestId}:reserve`,
    });

    await writeUsageEvent(env, reservation, 'reserved', null, null);
    return reservation;
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : 'SERVICE_UNAVAILABLE';
    await writeUsageEvent(env, reservation, 'failed', null, errorCode);
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
  const refundAmount = Math.max(reservation.reservedTokens - actualTokens, 0);

  if (refundAmount > 0) {
    await applyCreditMutation(env, {
      userId: reservation.userId,
      kind: 'refund',
      source: ROUTE_SOURCES[reservation.routeKey],
      amount: refundAmount,
      idempotencyKey: `${reservation.requestId}:refund-success`,
      relatedUsageId: reservation.usageEventId,
      metadata: {
        routeKey: reservation.routeKey,
        requestId: reservation.requestId,
        reason: 'actual_less_than_reserved',
      },
      ledgerId: `refund:${reservation.requestId}:success`,
    });
  }

  await writeUsageEvent(env, reservation, 'succeeded', actualTokens, null);
};

export const failAIUsage = async (
  env: ApiEnv['Bindings'],
  reservation: AIUsageReservation,
  errorCode: string,
) => {
  await applyCreditMutation(env, {
    userId: reservation.userId,
    kind: 'refund',
    source: ROUTE_SOURCES[reservation.routeKey],
    amount: reservation.reservedTokens,
    idempotencyKey: `${reservation.requestId}:refund-failed`,
    relatedUsageId: reservation.usageEventId,
    metadata: {
      routeKey: reservation.routeKey,
      requestId: reservation.requestId,
      reason: 'request_failed',
      errorCode,
    },
    ledgerId: `refund:${reservation.requestId}:failed`,
  });

  await writeUsageEvent(env, reservation, 'failed', null, errorCode);
};
