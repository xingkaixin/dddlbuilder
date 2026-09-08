import * as Clock from 'effect/Clock';
import * as Exit from 'effect/Exit';
import { withAIExecution } from './aiExecution.js';
import { readCompletedContent } from './aiCompletion.js';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Result from 'effect/Result';
import * as Cause from 'effect/Cause';
import * as Stream from 'effect/Stream';
import * as Schema from 'effect/Schema';
import { AIConfiguration, AIProvider, AIUsage } from './aiServices.js';
import {
  AIProviderError,
  AIUsageError,
  AIOutputError,
  type AICompletionError,
} from './aiErrors.js';
import { retryOpenAI } from './openaiRetry.js';
import { AIRequestAccess } from './aiAccess.js';
import type { Context } from 'hono';
import { stream } from 'hono/streaming';
import { encodeAIStreamEvent } from '@ddlbuilder/shared-types';
import type { AIRouteKey, AIUsageSettlement } from './aiUsage.js';
import type { ApiEnv, WorkerRequestLogger } from './context.js';
import {
  estimateRequestTokens,
  getOpenAIGovernanceSnapshot,
  logOpenAIAudit,
  readUsageFromStreamChunk,
  type OpenAIUsageSnapshot,
} from '../openaiControl.js';
import {
  errorResponse,
  getRequestId,
  parseJsonBodyWithLimit,
  DomainError,
  type ApiErrorCode,
} from './http.js';
import { createOpenAIStreamDebugLogger } from './aiStreamDebug.js';
import { getAIExecutionTimeoutMs } from './openaiConfig.js';
import {
  createWorkerBackgroundLogger,
  getRequestLogger,
  logWorkerBackgroundError,
  toWorkerError,
} from './logging.js';

const SETTLEMENT_INTENT_MAX_ATTEMPTS = 3;

// 兼容层：部分上游按这两个键关闭思维链，OpenAI 官方类型里没有它们
const THINKING_DISABLED = { thinking: { type: 'disabled' }, enable_thinking: false };

export type AIRequestRejection = {
  status: 400 | 413;
  code: ApiErrorCode;
  message: string;
};

const isRejection = (value: unknown): value is AIRequestRejection =>
  typeof value === 'object' && value !== null && 'code' in value && 'status' in value;

export const rejectAIRequest = (code: ApiErrorCode, message: string): AIRequestRejection => ({
  status: 400,
  code,
  message,
});

/**
 * 一次 AI 请求的治理句柄。额度在 reserve 时已经从账户扣走，终态结算由包装器保证：
 * 非流式路径在 run 返回后 succeed，流式路径在流结束/出错的回调里 settle，
 * run 抛异常则 fail——调用方没有任何需要记住的结算义务。
 */
export type AISession<Request> = {
  request: Request;
  /** 非流式补全：重试、usage 上报和 JSON 解析都在里面，调用方只拿结果。 */
  completeJson: (input: AICompletionInput) => Effect.Effect<unknown, AICompletionError>;
  /** 流式补全：把增量直接写进响应，结算和审计在流结束或出错时完成。 */
  streamCompletion: (input: AIStreamInput) => Effect.Effect<Response>;
};

export type AIChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type AIStreamInput = {
  scope: string;
  temperature: number;
  jsonResponse?: boolean;
  /** 只进 stream debug 日志，用来还原是什么输入触发了这次流。 */
  debugInput: Record<string, unknown>;
};

export type AICompletionInput = {
  scope: string;
  temperature: number;
};

export type AIRouteSpec<Request> = {
  route: AIRouteKey;
  maxOutputTokens: number;
  outputSchema?: Schema.ConstraintDecoder<unknown>;
  bodyMaxBytes: number;
  /** 返回 rejection 表示请求体不合法。 */
  parseRequest: (body: Record<string, unknown>) => Request | AIRequestRejection;
  /** 构造实际发送给模型的完整消息，同时作为额度和预算的预估输入。 */
  buildMessages: (request: Request) => AIChatMessage[];
};

/**
 * 五条 AI 路由共用的前置流水线：鉴权 → 用户限流 → 解析请求体 → 估算 → 预留额度 → 预算，
 * 任一步失败都会带上审计日志直接返回。走通之后把句柄交给 run，由它决定怎么调模型、
 * 怎么回包——流式路由会在流回调里才结算，所以结算时机必须留给 run 自己。
 */
export const aiGovernance = <Request, E>(
  c: Context<ApiEnv>,
  spec: AIRouteSpec<Request>,
  run: (session: AISession<Request>) => Effect.Effect<Response, E>,
) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const { route, maxOutputTokens } = spec;
      const { config, model, apiKey } = yield* AIConfiguration;
      const ledger = yield* AIUsage;
      const provider = yield* AIProvider;
      const access = yield* AIRequestAccess;
      const requestId = getRequestId(c) ?? 'unknown';
      const clock = yield* Clock.Clock;
      const startedAt = clock.currentTimeMillisUnsafe();
      const executionContext = yield* Effect.context();
      const validateOutput = (value: unknown) =>
        spec.outputSchema
          ? Schema.decodeUnknownEffect(spec.outputSchema)(value).pipe(
              Effect.mapError((cause) => new AIOutputError({ reason: 'invalid-schema', cause })),
              Effect.as(value),
            )
          : Effect.succeed(value);
      const governance = getOpenAIGovernanceSnapshot(route, config);
      const waitUntil = c.executionCtx.waitUntil.bind(c.executionCtx);

      let estimatedTokens = 0;
      let usage: OpenAIUsageSnapshot | null = null;
      let chargedTokens: number | null = null;
      let providerBudgetTokens: number | null = null;
      let usageEstimated: boolean | null = null;
      let accountingSnapshotReliable = false;
      let accountingFinalized = false;
      let attemptCount = 0;
      let auditUserId: string | null = null;
      let rateLimitRemaining: number | null = governance.rateLimitLimit;
      let budgetUsedTokens: number | null = null;
      let requestAborted = false;

      const audit = (
        status: number,
        retryCount: number,
        rateLimitHit: boolean,
        budgetHit: boolean,
        errorCode?: ApiErrorCode,
      ) => {
        const backgroundLog = requestAborted
          ? createWorkerBackgroundLogger(
              { background: { job: 'ai-stream-settlement', requestId, route } },
              waitUntil,
              c.env.ENVIRONMENT,
            )
          : undefined;
        logOpenAIAudit(
          backgroundLog
            ? { ...c.env, EVLOG_REQUEST_LOG: backgroundLog as WorkerRequestLogger }
            : c.env,
          {
            requestId,
            route,
            status,
            latencyMs: clock.currentTimeMillisUnsafe() - startedAt,
            retryCount,
            attemptCount,
            rateLimitHit,
            estimatedTokens,
            actualPromptTokens: usage?.promptTokens ?? null,
            actualCompletionTokens: usage?.completionTokens ?? null,
            actualTotalTokens: usage?.totalTokens ?? null,
            chargedTokens: accountingSnapshotReliable ? chargedTokens : null,
            providerBudgetTokens: accountingSnapshotReliable ? providerBudgetTokens : null,
            usageEstimated: accountingSnapshotReliable ? usageEstimated : null,
            accountingFinalized,
            userId: auditUserId,
            model,
            maxOutputTokens,
            rateLimitEnabled: governance.rateLimitEnabled,
            rateLimitStore: governance.rateLimitStore,
            rateLimitLimit: governance.rateLimitLimit,
            rateLimitRemaining,
            rateLimitWindowMs: governance.rateLimitWindowMs,
            budgetHit,
            budgetEnabled: governance.budgetEnabled,
            budgetLimitTokens: governance.budgetLimitTokens,
            budgetUsedTokens,
            errorCode,
          },
          waitUntil,
        );
        backgroundLog?.emit();
      };

      const governanceFailure = (error: unknown): Response => {
        getRequestLogger(c)?.error(toWorkerError(error, 'AI governance unavailable'), {
          ai: { failurePhase: 'governance' },
        });
        audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
        return errorResponse(c, 503, 'AI governance unavailable', 'SERVICE_UNAVAILABLE');
      };
      const authentication = yield* Effect.result(access.authenticate);
      if (Result.isFailure(authentication)) {
        const error = authentication.failure;
        if (error instanceof DomainError) {
          if (error.status === 401 && config.rateLimitEnabled) {
            const limitResult = yield* Effect.result(access.limitAnonymous);
            if (Result.isFailure(limitResult)) return governanceFailure(limitResult.failure);
            const limited = limitResult.success;
            if (limited) {
              audit(429, 0, true, false, 'RATE_LIMIT_EXCEEDED');
              return limited;
            }
          }
          audit(error.status, 0, false, false, error.code);
          return errorResponse(c, error.status, error.message, error.code);
        }
        getRequestLogger(c)?.error(toWorkerError(error, 'Authentication failed'), {
          ai: { failurePhase: 'authentication' },
        });
        audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
        return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
      }
      const user = authentication.success;
      auditUserId = user.userId;

      const parsedBody = yield* Effect.promise(() =>
        parseJsonBodyWithLimit<Record<string, unknown>>(c, spec.bodyMaxBytes),
      );
      if (!parsedBody.ok) {
        const tooLarge = parsedBody.response.status === 413;
        audit(
          parsedBody.response.status,
          0,
          false,
          false,
          tooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
        );
        return parsedBody.response;
      }

      const parsed = spec.parseRequest(parsedBody.data ?? {});
      if (isRejection(parsed)) {
        audit(parsed.status, 0, false, false, parsed.code);
        return errorResponse(c, parsed.status, parsed.message, parsed.code);
      }

      const limitResult = yield* Effect.result(access.limitUser(route, config, user.userId));
      if (Result.isFailure(limitResult)) return governanceFailure(limitResult.failure);
      const rateLimit = limitResult.success;
      rateLimitRemaining = rateLimit.remaining;
      if (rateLimit.response) {
        audit(429, 0, true, false, 'RATE_LIMIT_EXCEEDED');
        return rateLimit.response;
      }

      const messages = spec.buildMessages(parsed);
      estimatedTokens = estimateRequestTokens(messages, maxOutputTokens);

      if (!apiKey) {
        audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
        return errorResponse(c, 503, 'OpenAI service unavailable', 'SERVICE_UNAVAILABLE');
      }

      const credit = yield* Effect.result(
        Effect.gen(function* () {
          yield* ledger.grantSignup(user);
          return yield* ledger.reserve({
            userId: user.userId,
            routeKey: route,
            requestId,
            estimatedTokens,
          });
        }),
      );
      if (Result.isFailure(credit)) {
        const error = credit.failure;
        if (error instanceof DomainError) {
          audit(error.status, 0, false, false, error.code);
          return errorResponse(c, error.status, error.message, error.code);
        }
        getRequestLogger(c)?.error(toWorkerError(error, 'Credit reservation failed'), {
          ai: { failurePhase: 'credit_reservation' },
        });
        audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
        return errorResponse(c, 503, 'Credit service unavailable', 'SERVICE_UNAVAILABLE');
      }

      const reservation = credit.success;

      const getProviderBudgetTokens = (observedTokens: number | null) => {
        if (attemptCount === 0) return 0;
        const baseTokens = observedTokens ?? 0;
        const unknownAttempts = observedTokens === null ? attemptCount : attemptCount - 1;
        const remaining = Number.MAX_SAFE_INTEGER - baseTokens;
        if (unknownAttempts > Math.floor(remaining / reservation.reservedTokens)) {
          return Number.MAX_SAFE_INTEGER;
        }
        return baseTokens + unknownAttempts * reservation.reservedTokens;
      };

      const createSettlement = (): AIUsageSettlement => {
        if (usage) {
          chargedTokens =
            attemptCount > 1
              ? Math.max(usage.totalTokens, reservation.reservedTokens)
              : usage.totalTokens;
          providerBudgetTokens = getProviderBudgetTokens(usage.totalTokens);
          usageEstimated = attemptCount > 1;
          return {
            observedTotalTokens: usage.totalTokens,
            chargedTokens,
            providerBudgetTokens,
            usageEstimated,
          };
        }
        if (attemptCount === 0) {
          chargedTokens = 0;
          providerBudgetTokens = 0;
          usageEstimated = false;
          return {
            observedTotalTokens: 0,
            chargedTokens,
            providerBudgetTokens,
            usageEstimated,
          };
        }
        chargedTokens = reservation.reservedTokens;
        providerBudgetTokens = getProviderBudgetTokens(null);
        usageEstimated = true;
        return {
          observedTotalTokens: null,
          chargedTokens,
          providerBudgetTokens,
          usageEstimated,
        };
      };

      const settleBudget = (tokens: number) =>
        governance.budgetLimitTokens !== null
          ? ledger.settleBudget(reservation.usageEventId, tokens)
          : Effect.succeed(null);

      const reportSettlementError = (
        error: unknown,
        failurePhase: string,
        outcome: 'succeeded' | 'failed',
      ) => {
        const context = { ai: { failurePhase, settlementOutcome: outcome } };
        if (requestAborted) {
          logWorkerBackgroundError(
            error,
            {
              job: 'ai-stream-settlement',
              requestId,
              route,
              failurePhase,
              settlementOutcome: outcome,
            },
            waitUntil,
            c.env.ENVIRONMENT,
          );
          return;
        }
        getRequestLogger(c)?.error(
          error instanceof Error ? error : new Error('Unknown error'),
          context,
        );
      };

      const persistSettlementIntent = (
        outcome: 'succeeded' | 'failed',
        settlement: AIUsageSettlement,
        code: ApiErrorCode | null,
      ) =>
        ledger.prepare(reservation, outcome, settlement, code).pipe(
          Effect.retry({
            times: SETTLEMENT_INTENT_MAX_ATTEMPTS - 1,
            while: (error) => !(error instanceof DomainError),
          }),
        );

      const settleUsage = (outcome: 'succeeded' | 'failed', code: ApiErrorCode | null) =>
        Effect.gen(function* () {
          const preparation = yield* Effect.result(
            persistSettlementIntent(outcome, createSettlement(), code),
          );
          if (Result.isFailure(preparation)) {
            reportSettlementError(preparation.failure, 'credit_settlement_intent', outcome);
            return;
          }
          const prepared = preparation.success;
          chargedTokens = prepared.chargedTokens;
          providerBudgetTokens = prepared.providerBudgetTokens;
          accountingSnapshotReliable = true;
          const [creditResult, budgetResult] = yield* Effect.all(
            [
              Effect.result(
                prepared.needsFinalization
                  ? ledger.finalize(reservation, outcome, code)
                  : Effect.succeed(false),
              ),
              Effect.result(settleBudget(prepared.providerBudgetTokens)),
            ],
            { concurrency: 2 },
          );
          if (Result.isFailure(creditResult)) {
            reportSettlementError(creditResult.failure, 'credit_settlement', outcome);
          } else {
            accountingFinalized = !prepared.needsFinalization || creditResult.success;
          }
          if (Result.isFailure(budgetResult)) {
            reportSettlementError(budgetResult.failure, 'budget_settlement', outcome);
          } else if (budgetResult.success !== null) {
            budgetUsedTokens = budgetResult.success;
          }
        }).pipe(Effect.uninterruptible);

      const budgetResult = yield* Effect.result(
        access.reserveBudget(reservation.usageEventId, estimatedTokens, config),
      );
      if (Result.isFailure(budgetResult)) {
        yield* settleUsage('failed', 'SERVICE_UNAVAILABLE');
        getRequestLogger(c)?.error(
          toWorkerError(budgetResult.failure, 'Budget reservation failed'),
          {
            ai: { failurePhase: 'budget_reservation' },
          },
        );
        audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
        return errorResponse(c, 503, 'AI governance unavailable', 'SERVICE_UNAVAILABLE');
      }
      const budget = budgetResult.success;
      budgetUsedTokens = budget.usedTokens;
      if (budget.response) {
        yield* settleUsage('failed', 'BUDGET_EXCEEDED');
        audit(429, 0, false, true, 'BUDGET_EXCEEDED');
        return budget.response;
      }

      let settled = false;
      let streamed = false;
      let retryCount = 0;
      const openAIAbortController = new AbortController();
      const reportUsage = (next: OpenAIUsageSnapshot | null | undefined) => {
        if (next) usage = next;
      };
      const checkAborted = Effect.suspend(() =>
        openAIAbortController.signal.aborted
          ? Effect.fail(new AIProviderError({ cause: openAIAbortController.signal.reason }))
          : Effect.void,
      );
      const runOpenAIAttempt = <T>(operation: Effect.Effect<T, AIProviderError>) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            yield* checkAborted;
            // D1 may commit before its response arrives; finish the write before deciding whether to refund.
            attemptCount = yield* ledger.recordAttempt(reservation);
            if (openAIAbortController.signal.aborted) {
              attemptCount = yield* ledger.cancelAttempt(reservation, attemptCount);
            }
            yield* checkAborted;
            let started = false;
            return yield* restore(
              Effect.suspend(() => {
                started = true;
                retryCount = Math.max(0, attemptCount - 1);
                return operation;
              }),
            ).pipe(
              Effect.onExit(() =>
                started
                  ? Effect.void
                  : ledger.cancelAttempt(reservation, attemptCount).pipe(
                      Effect.tap((count) =>
                        Effect.sync(() => {
                          attemptCount = count;
                        }),
                      ),
                    ),
              ),
            );
          }),
        );
      const classifyFailure = (error: unknown) => {
        if (error instanceof AIUsageError) {
          return {
            code: 'SERVICE_UNAVAILABLE' as const,
            status: 503 as const,
            message: 'AI usage service unavailable',
          };
        }
        if (error instanceof AIOutputError && error.reason === 'truncated') {
          return {
            code: 'AI_OUTPUT_TRUNCATED' as const,
            status: 502 as const,
            message: error.message,
          };
        }
        if (error instanceof DomainError) {
          return { code: error.code, status: 502 as const, message: error.message };
        }
        return {
          code: 'UPSTREAM_OPENAI_ERROR' as const,
          status: 502 as const,
          message: 'Upstream OpenAI error',
        };
      };
      const onRetry = (event: { attempt: number; status: number | null; waitMs: number }) => {
        if (requestAborted) return;
        getRequestLogger(c)?.warn('OpenAI request retrying', {
          ai: {
            retries: [
              {
                attempt: event.attempt,
                status: event.status,
                waitMs: event.waitMs,
              },
            ],
          },
        });
      };
      const settleSuccess = (completedRetryCount: number) =>
        Effect.gen(function* () {
          if (settled) return;
          settled = true;
          yield* settleUsage('succeeded', null);
          audit(200, completedRetryCount, false, false);
        });
      const settleFailure = (code: ApiErrorCode, status: number, completedRetryCount: number) =>
        Effect.gen(function* () {
          if (settled) return;
          settled = true;
          yield* settleUsage('failed', code);
          audit(status, completedRetryCount, false, false, code);
        });

      const execute = <A, E>(operation: Effect.Effect<A, E>) =>
        withAIExecution(
          operation,
          openAIAbortController,
          getAIExecutionTimeoutMs(config) - (clock.currentTimeMillisUnsafe() - startedAt),
        );
      const settleExit = (exit: Exit.Exit<unknown, unknown>) => {
        if (Exit.isSuccess(exit)) return settleSuccess(retryCount);
        const failure = classifyFailure(Cause.squash(exit.cause));
        return settleFailure(failure.code, requestAborted ? 499 : failure.status, retryCount);
      };

      const session: AISession<Request> = {
        request: parsed,
        completeJson: ({ scope, temperature }) =>
          Effect.gen(function* () {
            const { data: response } = yield* retryOpenAI(
              runOpenAIAttempt(
                provider.complete(
                  {
                    model,
                    messages,
                    response_format: { type: 'json_object' },
                    temperature,
                    max_tokens: maxOutputTokens,
                    ...(THINKING_DISABLED as Record<string, unknown>),
                  },
                  openAIAbortController.signal,
                ),
              ),
              { scope, onRetry },
              config,
            );
            const usageSnapshot = response.usage;
            reportUsage(
              usageSnapshot
                ? {
                    promptTokens: usageSnapshot.prompt_tokens,
                    completionTokens: usageSnapshot.completion_tokens,
                    totalTokens: usageSnapshot.total_tokens,
                  }
                : null,
            );
            const choice = response.choices[0];
            const content = choice?.message?.content ?? '';
            return yield* readCompletedContent(content, choice?.finish_reason, true).pipe(
              Effect.flatMap(validateOutput),
              Effect.tapError((error) =>
                Effect.sync(() => {
                  getRequestLogger(c)?.error(toWorkerError(error, 'Completion validation failed'), {
                    ai: {
                      failurePhase: 'completion_validation',
                      finishReason: choice?.finish_reason ?? null,
                      contentLength: content.length,
                    },
                  });
                }),
              ),
            );
          }),
        streamCompletion: ({ scope, temperature, jsonResponse, debugInput }) =>
          Effect.sync(() => {
            c.header('X-AI-Stream-Debug', config.streamDebugEnabled ? '1' : '0');
            streamed = true;
            const streamDebug = createOpenAIStreamDebugLogger({
              enabled: config.streamDebugEnabled,
              requestId,
              route,
              model,
              startedAt,
              input: debugInput,
              log: getRequestLogger(c),
            });
            c.header('Content-Type', 'application/x-ndjson; charset=utf-8');
            c.header('Cache-Control', 'no-cache');
            return stream(c, async (output) => {
              output.onAbort(() => {
                requestAborted = true;
                openAIAbortController.abort();
              });
              const write = (event: Parameters<typeof encodeAIStreamEvent>[0]) =>
                Effect.tryPromise({
                  try: () => output.write(encodeAIStreamEvent(event)),
                  catch: (cause) => new AIProviderError({ cause }),
                });
              const completion = Effect.gen(function* () {
                streamDebug.start();
                const { data: response } = yield* retryOpenAI(
                  runOpenAIAttempt(
                    provider.stream(
                      {
                        model,
                        messages,
                        ...(jsonResponse
                          ? { response_format: { type: 'json_object' as const } }
                          : {}),
                        temperature,
                        max_tokens: maxOutputTokens,
                        stream: true,
                        stream_options: { include_usage: true },
                        ...(THINKING_DISABLED as Record<string, unknown>),
                      },
                      openAIAbortController.signal,
                    ),
                  ),
                  { scope, onRetry },
                  config,
                );
                streamDebug.connected();
                let fullText = '';
                let finishReason: string | null = null;
                yield* Stream.fromAsyncIterable(
                  response,
                  (cause) => new AIProviderError({ cause }),
                ).pipe(
                  Stream.runForEach((chunk) =>
                    Effect.gen(function* () {
                      reportUsage(readUsageFromStreamChunk(chunk));
                      const choice = chunk.choices[0];
                      if (choice?.finish_reason) finishReason = choice.finish_reason;
                      const content = choice?.delta?.content ?? '';
                      if (content) {
                        fullText += content;
                        streamDebug.chunk(content);
                        yield* write({ type: 'delta', text: content });
                      }
                    }),
                  ),
                );
                yield* checkAborted;
                const completed = yield* readCompletedContent(
                  fullText,
                  finishReason,
                  Boolean(jsonResponse),
                );
                yield* validateOutput(completed);
                streamDebug.complete();
              });
              const task = Effect.runPromise(
                execute(completion).pipe(
                  Effect.onExit(settleExit),
                  Effect.flatMap(() => write({ type: 'done' })),
                  Effect.catchCause((cause) =>
                    Effect.gen(function* () {
                      const error = Cause.squash(cause);
                      if (requestAborted) {
                        streamDebug.error(new Error('Client aborted AI stream'));
                        return;
                      }
                      streamDebug.error(error);
                      getRequestLogger(c)?.error(toWorkerError(error, 'Unknown stream error'), {
                        ai: { failurePhase: 'stream' },
                      });
                      const failure = classifyFailure(error);
                      yield* write({
                        type: 'error',
                        error: failure.message,
                        code: failure.code,
                        requestId,
                      });
                    }),
                  ),
                  Effect.provideContext(executionContext),
                ),
              );
              waitUntil(task);
              await task;
            });
          }),
      };

      return yield* restore(execute(Effect.suspend(() => run(session)))).pipe(
        Effect.onExit((exit) => (streamed ? Effect.void : settleExit(exit))),
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            const error = Cause.squash(cause);
            getRequestLogger(c)?.error(toWorkerError(error, 'AI request failed'), {
              ai: { failurePhase: 'request' },
            });
            const failure = classifyFailure(error);
            return errorResponse(c, failure.status, failure.message, failure.code);
          }),
        ),
      );
    }),
  );

export const withAIGovernance = <Request, E = AICompletionError>(
  c: Context<ApiEnv>,
  spec: AIRouteSpec<Request>,
  run: (session: AISession<Request>) => Effect.Effect<Response, E>,
): Promise<Response> => {
  const services = Layer.mergeAll(
    AIProvider.layer,
    AIUsage.layer(c.env),
    AIRequestAccess.layer(c),
  ).pipe(Layer.provideMerge(AIConfiguration.layer(c.env)));
  return Effect.runPromise(aiGovernance(c, spec, run).pipe(Effect.provide(services)));
};
