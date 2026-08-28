import type { Context } from 'hono';
import type { ApiEnv } from './context.js';
import { errorResponse } from './http.js';

export type RequestRateLimitPolicy = {
  scope: string;
  limit: number;
  windowMs: number;
};

export type RequestRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export const getClientIp = (c: Context<ApiEnv>): string => {
  const direct = c.req.header('cf-connecting-ip')?.trim();
  if (direct) return direct;
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return c.req.header('x-real-ip')?.trim() || 'unknown';
};

const hashSubject = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const enforceRequestRateLimit = async (
  c: Context<ApiEnv>,
  policy: RequestRateLimitPolicy,
): Promise<RequestRateLimitResult> => {
  const now = Date.now();
  const windowId = String(Math.floor(now / policy.windowMs));
  const windowEndsAt = (Number(windowId) + 1) * policy.windowMs;
  const subject = await hashSubject(getClientIp(c));
  const results = await c.env.USER_DB.batch<{ value: number }>([
    c.env.USER_DB.prepare(
      `
        INSERT INTO request_rate_limits (
          scope,
          subject,
          window_id,
          value,
          expires_at
        )
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(scope, subject) DO UPDATE SET
          window_id = excluded.window_id,
          value = CASE
            WHEN request_rate_limits.window_id = excluded.window_id
              THEN request_rate_limits.value + 1
            ELSE 1
          END,
          expires_at = excluded.expires_at
        WHERE (
          CASE
            WHEN request_rate_limits.window_id = excluded.window_id
              THEN request_rate_limits.value + 1
            ELSE 1
          END
        ) <= ?
        RETURNING value
      `,
    ).bind(policy.scope, subject, windowId, windowEndsAt, policy.limit),
  ]);
  const value = results[0]?.results?.[0]?.value;
  const used = value == null ? policy.limit : Number(value);
  return {
    allowed: value != null,
    limit: policy.limit,
    remaining: Math.max(policy.limit - used, 0),
    retryAfterSeconds: Math.max(Math.ceil((windowEndsAt - now) / 1000), 1),
  };
};

export const enforceIpRateLimit = async (
  c: Context<ApiEnv>,
  policy: RequestRateLimitPolicy,
  message: string,
): Promise<Response | null> => {
  const rateLimit = await enforceRequestRateLimit(c, policy);
  c.header('X-RateLimit-Limit', String(rateLimit.limit));
  c.header('X-RateLimit-Remaining', String(rateLimit.remaining));
  if (rateLimit.allowed) return null;
  c.header('Retry-After', String(rateLimit.retryAfterSeconds));
  return errorResponse(c, 429, message, 'RATE_LIMIT_EXCEEDED');
};
