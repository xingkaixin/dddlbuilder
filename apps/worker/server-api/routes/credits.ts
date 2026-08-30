import type { Context, Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { resolveAuthenticatedUser as resolveSessionUser } from '../lib/auth.js';
import {
  countCreditLedger,
  getCreditAccount,
  grantSignupCredits,
  listCreditLedger,
} from '../lib/credits.js';
import { DomainError, withMeta } from '../lib/http.js';
import { getRequestLogger, toWorkerError } from '../lib/logging.js';

const parseLedgerLimit = (value: string | undefined) => {
  const parsed = Number.parseInt(value ?? '20', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }
  return Math.min(parsed, 50);
};

const parseLedgerOffset = (value: string | undefined) => {
  const parsed = Number.parseInt(value ?? '0', 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

const parseLedgerDateTime = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.getTime();
};

const resolveAuthenticatedUser = async (c: Context<ApiEnv>) => {
  const user = await resolveSessionUser(c);
  if (!user) {
    throw new DomainError(401, 'AUTH_REQUIRED', 'Authentication required');
  }
  return user;
};

// 查询路径的意外故障统一按额度服务不可用处理；领域错误（401/402 等）直接冒泡给全局 onError
const wrapCreditService = async (c: Context<ApiEnv>, handler: () => Promise<Response>) => {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    getRequestLogger(c)?.error(toWorkerError(error, 'Credit query failed'), {
      outcome: { errorCode: 'SERVICE_UNAVAILABLE' },
    });
    throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'Credit service unavailable');
  }
};

export function registerCreditRoutes(app: Hono<ApiEnv>) {
  app.get('/credits/balance', async (c) => {
    const user = await resolveAuthenticatedUser(c);
    return wrapCreditService(c, async () => {
      await grantSignupCredits(c.env, user);
      const account = await getCreditAccount(c.env, user.userId);
      return c.json(
        withMeta(c, {
          balance: account?.balance ?? 0,
          version: account?.version ?? 0,
          userId: user.userId,
        }),
      );
    });
  });

  app.get('/credits/ledger', async (c) => {
    const user = await resolveAuthenticatedUser(c);
    return wrapCreditService(c, async () => {
      const limit = parseLedgerLimit(c.req.query('limit'));
      const offset = parseLedgerOffset(c.req.query('offset'));
      const filters = {
        startDate: parseLedgerDateTime(c.req.query('startAt')),
        endDate: parseLedgerDateTime(c.req.query('endAt')),
      };
      const [items, total] = await Promise.all([
        listCreditLedger(c.env, user.userId, {
          ...filters,
          limit,
          offset,
        }),
        countCreditLedger(c.env, user.userId, filters),
      ]);
      return c.json(
        withMeta(c, {
          items,
          total,
          limit,
          offset,
        }),
      );
    });
  });
}
