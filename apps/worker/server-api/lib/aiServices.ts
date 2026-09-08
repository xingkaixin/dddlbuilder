import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import OpenAI from 'openai';
import type { AIRouteKey } from './aiRouteKey.js';
import type { ApiEnv } from './context.js';
import { AIProviderError, AIUsageError } from './aiErrors.js';
import { DomainError } from './http.js';
import { loadOpenAIConfig, type OpenAIConfig } from './openaiConfig.js';
import {
  type AIUsageReservation,
  type AIUsageSettlement,
  cancelUnstartedAIUsageAttempt,
  finalizeAIUsageSettlement,
  prepareAIUsageSettlement,
  recordAIUsageAttempt,
  reserveAIUsage,
} from './aiUsage.js';
import { grantSignupCredits } from './credits.js';
import { settleAIDailyBudget } from './aiBudget.js';

export class AIConfiguration extends Context.Service<
  AIConfiguration,
  {
    config: OpenAIConfig;
    apiKey: string | undefined;
    baseURL: string;
    model: string;
  }
>()('ddlbuilder/AIConfiguration') {
  static layer(env: ApiEnv['Bindings']) {
    return Layer.effect(
      AIConfiguration,
      Effect.map(loadOpenAIConfig(env), (config) => ({
        config,
        apiKey: env.OPENAI_API_KEY,
        baseURL: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: env.OPENAI_MODEL_NAME || 'gpt-4o-mini',
      })),
    );
  }
}

const makeProvider = (client: () => OpenAI) => ({
  complete: (
    body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    signal: AbortSignal,
  ) =>
    Effect.tryPromise({
      try: (interruption) =>
        client().chat.completions.create(body, { signal: AbortSignal.any([signal, interruption]) }),
      catch: (cause) => new AIProviderError({ cause }),
    }),
  stream: (
    body: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
    signal: AbortSignal,
  ): Effect.Effect<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>, AIProviderError> =>
    Effect.tryPromise({
      try: (interruption) =>
        client().chat.completions.create(body, { signal: AbortSignal.any([signal, interruption]) }),
      catch: (cause) => new AIProviderError({ cause }),
    }),
});

export class AIProvider extends Context.Service<AIProvider, ReturnType<typeof makeProvider>>()(
  'ddlbuilder/AIProvider',
) {
  static layer = Layer.effect(
    AIProvider,
    Effect.gen(function* () {
      const { apiKey, baseURL, config } = yield* AIConfiguration;
      let client: OpenAI | undefined;
      return makeProvider(
        () =>
          (client ??= new OpenAI({
            apiKey,
            baseURL,
            maxRetries: 0,
            timeout: config.requestTimeoutMs,
          })),
      );
    }),
  );
}

const usageOperation = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) => (cause instanceof DomainError ? cause : new AIUsageError({ cause })),
  });

const makeUsage = (env: ApiEnv['Bindings']) => ({
  grantSignup: (user: { userId: string; email: string }) =>
    usageOperation(() => grantSignupCredits(env, user)),
  reserve: (input: {
    userId: string;
    routeKey: AIRouteKey;
    requestId: string;
    estimatedTokens: number;
  }) => usageOperation(() => reserveAIUsage(env, input)),
  recordAttempt: (reservation: AIUsageReservation) =>
    usageOperation(() => recordAIUsageAttempt(env, reservation)).pipe(
      Effect.mapError((cause) =>
        cause instanceof AIUsageError ? cause : new AIUsageError({ cause }),
      ),
    ),
  cancelAttempt: (reservation: AIUsageReservation, attempt: number) =>
    usageOperation(() => cancelUnstartedAIUsageAttempt(env, reservation, attempt)).pipe(
      Effect.mapError((cause) =>
        cause instanceof AIUsageError ? cause : new AIUsageError({ cause }),
      ),
    ),
  prepare: (
    reservation: AIUsageReservation,
    outcome: 'succeeded' | 'failed',
    settlement: AIUsageSettlement,
    code: string | null,
  ) => usageOperation(() => prepareAIUsageSettlement(env, reservation, outcome, settlement, code)),
  finalize: (
    reservation: AIUsageReservation,
    outcome: 'succeeded' | 'failed',
    code: string | null,
  ) => usageOperation(() => finalizeAIUsageSettlement(env, reservation, outcome, code)),
  settleBudget: (usageEventId: string, tokens: number) =>
    usageOperation(() => settleAIDailyBudget(env, usageEventId, tokens)),
});

export class AIUsage extends Context.Service<AIUsage, ReturnType<typeof makeUsage>>()(
  'ddlbuilder/AIUsage',
) {
  static layer(env: ApiEnv['Bindings']) {
    return Layer.succeed(AIUsage, makeUsage(env));
  }
}
