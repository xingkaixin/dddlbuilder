import type { Context, Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { resolveAuthenticatedUser } from '../lib/auth.js';
import { createBetterAuth } from '../lib/betterAuth.js';
import { DomainError, errorResponse, parseJsonBodyWithLimit, withMeta } from '../lib/http.js';
import { enforceIpRateLimit } from '../lib/requestRateLimit.js';
import { getUserSystemConfig } from '../lib/userSystemConfig.js';

type TurnstileVerifyResponse = {
  success: boolean;
  action?: string;
  'error-codes'?: string[];
};

const AUTH_BODY_MAX_BYTES = 16 * 1024;
const SIGNUP_RATE_LIMIT = {
  scope: 'auth:signup',
  limit: 5,
  windowMs: 15 * 60 * 1000,
} as const;
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
  } catch {
    return errorResponse(c, 503, 'Turnstile service unavailable', 'SERVICE_UNAVAILABLE');
  }

  if (!response.ok) {
    return errorResponse(c, 503, 'Turnstile service unavailable', 'SERVICE_UNAVAILABLE');
  }

  const result = (await response.json()) as TurnstileVerifyResponse;
  if (!result.success || result.action !== 'signup') {
    return errorResponse(c, 403, 'Turnstile verification failed', 'TURNSTILE_FAILED');
  }
  return null;
};

export function registerAuthRoutes(app: Hono<ApiEnv>) {
  app.post('/auth/sign-up/email', async (c) => {
    const limited = await enforceIpRateLimit(c, SIGNUP_RATE_LIMIT, 'Too many signup attempts');
    if (limited) return limited;

    const parsedBody = await parseJsonBodyWithLimit<Record<string, unknown>>(
      c,
      AUTH_BODY_MAX_BYTES,
    );
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const body = parsedBody.data ?? {};
    const bodyToken = typeof body.turnstileToken === 'string' ? body.turnstileToken.trim() : '';
    const token = c.req.header('x-turnstile-token')?.trim() || bodyToken;
    if (!token) {
      return errorResponse(c, 400, 'Turnstile token is required', 'TURNSTILE_REQUIRED');
    }

    const verificationError = await verifyTurnstile(c, token);
    if (verificationError) return verificationError;

    delete body.turnstileToken;
    const headers = new Headers(c.req.raw.headers);
    headers.set('content-type', 'application/json');
    headers.delete('content-length');
    return createBetterAuth(c.env).handler(
      new Request(c.req.raw.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    );
  });

  app.all('/auth/*', async (c) => createBetterAuth(c.env).handler(c.req.raw));

  app.get('/me', async (c) => {
    try {
      const user = await resolveAuthenticatedUser(c.env, c.req.raw.headers);
      if (!user) {
        return c.json(withMeta(c, { signedIn: false as const, user: null }));
      }

      c.set('currentUserId', user.userId);
      return c.json(
        withMeta(c, {
          signedIn: true as const,
          user: {
            userId: user.userId,
            email: user.email,
            emailVerified: user.emailVerified,
            name: user.name,
          },
        }),
      );
    } catch (error) {
      // USER_DISABLED 是明确的账号状态，要原样告诉前端；其余按服务故障处理
      if (error instanceof DomainError && error.code === 'USER_DISABLED') {
        return errorResponse(c, error.status, error.message, error.code);
      }
      console.error('[auth] /me failed', error);
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }
  });
}
