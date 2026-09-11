import * as Schema from 'effect/Schema';
import { MeResponseSchema } from '@ddlbuilder/shared-types/api';
import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { resolveAuthenticatedUser } from '../lib/auth.js';
import { createBetterAuth } from '../lib/betterAuth.js';
import { parseJsonBodyWithLimit, validateRequestBodyWithLimit, withMeta } from '../lib/http.js';
import { enforceIpRateLimit } from '../lib/requestRateLimit.js';
import { getAuthBodyMaxBytes } from '../lib/userSystemConfig.js';

const SIGNUP_RATE_LIMIT = {
  scope: 'auth:signup',
  limit: 5,
  windowMs: 15 * 60 * 1000,
} as const;
const AUTH_RATE_LIMITS = {
  '/auth/sign-in/email': { scope: 'auth:signin', limit: 10, windowMs: 15 * 60_000 },
  '/auth/request-password-reset': { scope: 'auth:reset', limit: 3, windowMs: 60 * 60_000 },
  '/auth/send-verification-email': { scope: 'auth:verify', limit: 3, windowMs: 60 * 60_000 },
  '/auth/email-otp/verify-email': { scope: 'auth:verify-otp', limit: 10, windowMs: 15 * 60_000 },
} as const;
const SAFE_AUTH_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function registerAuthRoutes(app: Hono<ApiEnv>) {
  app.post('/auth/sign-up/email', async (c) => {
    const limited = await enforceIpRateLimit(c, SIGNUP_RATE_LIMIT, 'Too many signup attempts');

    if (limited) return limited;

    const parsedBody = await parseJsonBodyWithLimit(c, getAuthBodyMaxBytes(c.env));

    if (!parsedBody.ok) return parsedBody.response;

    const headers = new Headers(c.req.raw.headers);
    headers.set('content-type', 'application/json');
    headers.delete('content-length');

    return createBetterAuth(c.env).handler(
      new Request(c.req.raw.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(parsedBody.data),
      }),
    );
  });

  app.all('/auth/*', async (c) => {
    if (!SAFE_AUTH_METHODS.has(c.req.method)) {
      const path = c.req.path.replace(/^\/api/, '').replace(/\/$/, '');

      const policy = Object.entries(AUTH_RATE_LIMITS).find(([route]) => route === path)?.[1] ?? {
        scope: 'auth:mutation',
        limit: 60,
        windowMs: 60_000,
      };
      const limited = await enforceIpRateLimit(c, policy, 'Too many authentication attempts');

      if (limited) return limited;
    }

    if (c.req.raw.body) {
      const bodyValidation = await validateRequestBodyWithLimit(c, getAuthBodyMaxBytes(c.env));

      if (!bodyValidation.ok) return bodyValidation.response;
    }

    return createBetterAuth(c.env).handler(c.req.raw);
  });

  app.get('/me', async (c) => {
    const user = await resolveAuthenticatedUser(c);

    if (!user) {
      return c.json(
        Schema.decodeUnknownSync(MeResponseSchema)(
          withMeta(c, { signedIn: false as const, user: null }),
        ),
      );
    }

    c.set('currentUserId', user.userId);

    return c.json(
      Schema.decodeUnknownSync(MeResponseSchema)(
        withMeta(c, {
          signedIn: true as const,
          user: {
            userId: user.userId,
            email: user.email,
            emailVerified: user.emailVerified,
            name: user.name,
          },
        }),
      ),
    );
  });
}
