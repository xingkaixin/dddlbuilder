import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateAccessToken, isInvalidJwtError, readBearerToken } from '../lib/auth.js';
import { errorResponse, withMeta } from '../lib/http.js';
import { getUserSystemConfig } from '../lib/userSystemConfig.js';

type TurnstileVerifyResponse = {
  success: boolean;
  'error-codes'?: string[];
};

export function registerAuthRoutes(app: Hono<ApiEnv>) {
  app.get('/me', async (c) => {
    const token = readBearerToken(c);
    if (!token) {
      return c.json(withMeta(c, { signedIn: false as const, user: null }));
    }

    try {
      const user = await authenticateAccessToken(c.env, token);
      c.set('currentUserId', user.appUserId);
      return c.json(
        withMeta(c, {
          signedIn: true as const,
          user: {
            appUserId: user.appUserId,
            externalUserId: user.externalUserId,
            email: user.email,
          },
        }),
      );
    } catch (error) {
      if (isInvalidJwtError(error)) {
        return errorResponse(c, 401, 'Invalid or expired access token', 'INVALID_AUTH_TOKEN');
      }
      if (error instanceof Error && error.message === 'USER_DISABLED') {
        return errorResponse(c, 403, 'User account is disabled', 'USER_DISABLED');
      }
      console.error('[auth] /me failed', error);
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }
  });

  app.post('/auth/turnstile/verify', async (c) => {
    let body: { token?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON');
    }

    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) {
      return errorResponse(c, 400, 'Turnstile token is required', 'TURNSTILE_REQUIRED');
    }

    const config = getUserSystemConfig(c.env);
    const formData = new URLSearchParams();
    formData.set('secret', config.turnstileSecretKey);
    formData.set('response', token);
    const remoteIp = c.req.header('cf-connecting-ip');
    if (remoteIp) {
      formData.set('remoteip', remoteIp);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      return errorResponse(c, 503, 'Turnstile service unavailable', 'SERVICE_UNAVAILABLE');
    }

    const result = (await response.json()) as TurnstileVerifyResponse;
    if (!result.success) {
      return errorResponse(c, 403, 'Turnstile verification failed', 'TURNSTILE_FAILED');
    }

    return c.json(withMeta(c, { success: true as const }));
  });
}
