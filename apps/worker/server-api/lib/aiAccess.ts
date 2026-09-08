import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { Context as HonoContext } from 'hono';
import type { ApiEnv } from './context.js';
import type { OpenAIConfig } from './openaiConfig.js';
import type { AIRouteKey } from './aiRouteKey.js';
import { AIGovernanceError } from './aiErrors.js';
import { DomainError } from './http.js';
import { authenticateRequest } from './auth.js';
import { enforceIpRateLimit } from './requestRateLimit.js';
import { enforceOpenAIRateLimit, enforceOpenAIDailyBudget } from '../openaiControl.js';

const operation = <A>(phase: AIGovernanceError['phase'], run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      cause instanceof DomainError ? cause : new AIGovernanceError({ phase, cause }),
  });

const makeAccess = (c: HonoContext<ApiEnv>) => ({
  authenticate: operation('authentication', () => authenticateRequest(c)),
  limitAnonymous: operation('rate_limit', () =>
    enforceIpRateLimit(
      c,
      { scope: 'ai:anonymous', limit: 60, windowMs: 60_000 },
      'Too many unauthenticated AI requests',
    ),
  ),
  limitUser: (route: AIRouteKey, config: OpenAIConfig, userId: string) =>
    operation('rate_limit', () => enforceOpenAIRateLimit(c, route, config, userId)),
  reserveBudget: (usageEventId: string, estimatedTokens: number, config: OpenAIConfig) =>
    operation('budget_reservation', () =>
      enforceOpenAIDailyBudget(c, usageEventId, estimatedTokens, config),
    ),
});

export class AIRequestAccess extends Context.Service<
  AIRequestAccess,
  ReturnType<typeof makeAccess>
>()('ddlbuilder/AIRequestAccess') {
  static layer(c: HonoContext<ApiEnv>) {
    return Layer.succeed(AIRequestAccess, makeAccess(c));
  }
}
