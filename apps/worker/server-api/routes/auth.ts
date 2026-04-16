import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { resolveAuthenticatedUser } from '../lib/auth.js';
import { createBetterAuth } from '../lib/betterAuth.js';
import { errorResponse, withMeta } from '../lib/http.js';
import { getUserSystemConfig } from '../lib/userSystemConfig.js';

type TurnstileVerifyResponse = {
  success: boolean;
  'error-codes'?: string[];
};

export function registerAuthRoutes(app: Hono<ApiEnv>) {
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
      console.error('[auth] /me failed', error);
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }
  });
}
