import * as Schema from 'effect/Schema';
import { MeResponseSchema } from '@ddlbuilder/shared-types/api';
import type { Context, Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { resolveAuthenticatedUser } from '../lib/auth.js';
import { createBetterAuth } from '../lib/betterAuth.js';
import {
  errorResponse,
  parseJsonBodyWithLimit,
  validateRequestBodyWithLimit,
  withMeta,
} from '../lib/http.js';
import { enforceIpRateLimit } from '../lib/requestRateLimit.js';
import { getRequestLogger } from '../lib/logging.js';
import { getAuthBodyMaxBytes, getUserSystemConfig } from '../lib/userSystemConfig.js';

type TurnstileVerifyResponse = {
  success: boolean;
  action?: string;
  'error-codes'?: string[];
};

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
const TURNSTILE_ALWAYS_PASS_TEST_SECRET = '1x0000000000000000000000000000000AA';

const verifyTurnstile = async (c: Context<ApiEnv>, token: string) => {
  const config = getUserSystemConfig(c.env);

  if (config.turnstileSecretKey === TURNSTILE_ALWAYS_PASS_TEST_SECRET) {
    return null;
  }

  const formData = new URLSearchParams();
  formData.set('secret', config.turnstileSecretKey);
  formData.set('response', token);
  const remoteIp = c.req.header('cf-connecting-ip');

  if (remoteIp) {
    formData.set('remoteip', remoteIp);
  }

  let response: Response;

  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });
  } catch (error) {
    getRequestLogger(c)?.error(error instanceof Error ? error : String(error));

    return errorResponse(c, 503, 'Turnstile service unavailable', 'SERVICE_UNAVAILABLE');
  }

  if (!response.ok) {
    return errorResponse(c, 503, 'Turnstile service unavailable', 'SERVICE_UNAVAILABLE');
  }

  const rawResult = await response.json();

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the Turnstile response is untrusted external JSON.
  if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult)) {
    return errorResponse(c, 403, 'Turnstile verification failed', 'TURNSTILE_FAILED');
  }

  // SAFETY: the object guard establishes the JSON record boundary; the field checks below establish this response contract.
  const result = rawResult as Partial<TurnstileVerifyResponse>;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- success/action must be validated before using the external response.
  if (typeof result.success !== 'boolean' || typeof result.action !== 'string') {
    return errorResponse(c, 403, 'Turnstile verification failed', 'TURNSTILE_FAILED');
  }

  if (!result.success || result.action !== 'signup') {
    return errorResponse(c, 403, 'Turnstile verification failed', 'TURNSTILE_FAILED');
  }

  return null;
};

export function registerAuthRoutes(app: Hono<ApiEnv>) {
  app.post('/auth/sign-up/email', async (c) => {
    const limited = await enforceIpRateLimit(c, SIGNUP_RATE_LIMIT, 'Too many signup attempts');

    if (limited) return limited;

    const parsedBody = await parseJsonBodyWithLimit(c, getAuthBodyMaxBytes(c.env));

    if (!parsedBody.ok) return parsedBody.response;
    // oxlint-disable anti-slop/no-runtime-typeof -- raw signup JSON must be narrowed before reading its token field.

    const body =
      parsedBody.data && typeof parsedBody.data === 'object' && !Array.isArray(parsedBody.data)
        ? parsedBody.data
        : null;
    // oxlint-enable anti-slop/no-runtime-typeof
    // oxlint-disable anti-slop/no-runtime-typeof -- the token comes from an untyped JSON body.

    const bodyToken =
      body && 'turnstileToken' in body && typeof body.turnstileToken === 'string'
        ? body.turnstileToken.trim()
        : '';
    // oxlint-enable anti-slop/no-runtime-typeof
    const token = c.req.header('x-turnstile-token')?.trim() || bodyToken;

    if (!token) {
      return errorResponse(c, 400, 'Turnstile token is required', 'TURNSTILE_REQUIRED');
    }

    const verificationError = await verifyTurnstile(c, token);

    if (verificationError) return verificationError;

    const bodyWithoutToken = Object.fromEntries(
      body ? Object.entries(body).filter(([key]) => key !== 'turnstileToken') : [],
    );
    const headers = new Headers(c.req.raw.headers);
    headers.set('content-type', 'application/json');
    headers.delete('content-length');

    return createBetterAuth(c.env).handler(
      new Request(c.req.raw.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyWithoutToken),
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
