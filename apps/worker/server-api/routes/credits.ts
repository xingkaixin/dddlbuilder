import * as Schema from 'effect/Schema';
import {
  CreditLedgerQuerySchema,
  CreditBalanceResponseSchema,
  CreditLedgerResponseSchema,
} from '@ddlbuilder/shared-types/api';
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
        Schema.decodeUnknownSync(CreditBalanceResponseSchema)(
          withMeta(c, {
            balance: account?.balance ?? 0,
            version: account?.version ?? 0,
            userId: user.userId,
          }),
        ),
      );
    });
  });

  app.get('/credits/ledger', async (c) => {
    const user = await resolveAuthenticatedUser(c);

    return wrapCreditService(c, async () => {
      const { limit, offset, ...filters } = Schema.decodeUnknownSync(CreditLedgerQuerySchema)(
        c.req.query(),
      );
      const [items, total] = await Promise.all([
        listCreditLedger(c.env, user.userId, {
          ...filters,
          limit,
          offset,
        }),
        countCreditLedger(c.env, user.userId, filters),
      ]);

      return c.json(
        Schema.decodeUnknownSync(CreditLedgerResponseSchema)(
          withMeta(c, {
            items,
            total,
            limit,
            offset,
          }),
        ),
      );
    });
  });
}
