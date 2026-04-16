import type { Context, Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { resolveAuthenticatedUser as resolveSessionUser } from '../lib/auth.js';
import { getCreditAccount, listCreditLedger } from '../lib/credits.js';
import { errorResponse, withMeta } from '../lib/http.js';

const parseLedgerLimit = (value: string | undefined) => {
  const parsed = Number.parseInt(value ?? '20', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }
  return Math.min(parsed, 50);
};

const resolveAuthenticatedUser = async (c: Context<ApiEnv>) => {
  return resolveSessionUser(c.env, c.req.raw.headers);
};

export function registerCreditRoutes(app: Hono<ApiEnv>) {
  app.get('/credits/balance', async (c) => {
    try {
      const user = await resolveAuthenticatedUser(c);
      if (!user) {
        return errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED');
      }

      const account = await getCreditAccount(c.env, user.userId);
      return c.json(
        withMeta(c, {
          balance: account?.balance ?? 0,
          version: account?.version ?? 0,
          userId: user.userId,
        }),
      );
    } catch (error) {
      console.error('[credits] balance failed', error);
      return errorResponse(c, 503, 'Credit service unavailable', 'SERVICE_UNAVAILABLE');
    }
  });

  app.get('/credits/ledger', async (c) => {
    try {
      const user = await resolveAuthenticatedUser(c);
      if (!user) {
        return errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED');
      }

      const items = await listCreditLedger(
        c.env,
        user.userId,
        parseLedgerLimit(c.req.query('limit')),
      );
      return c.json(
        withMeta(c, {
          items,
        }),
      );
    } catch (error) {
      console.error('[credits] ledger failed', error);
      return errorResponse(c, 503, 'Credit service unavailable', 'SERVICE_UNAVAILABLE');
    }
  });
}
