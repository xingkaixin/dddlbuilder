import { authenticateRequest, type AuthenticatedAppUser } from './auth.js';
import { grantSignupCredits } from './credits.js';
import type { Context } from 'hono';
import { stream } from 'hono/streaming';
import { encodeAIStreamEvent } from '@ddlbuilder/shared-types';
import OpenAI from 'openai';
import {
  type AIRouteKey,
  type AIUsageReservation,
  type AIUsageSettlement,
  finalizeAIUsageSettlement,
  prepareAIUsageSettlement,
  recordAIUsageAttempt,
  reserveAIUsage,
} from './aiUsage.js';
import type { ApiEnv } from './context.js';
import {
  buildOpenAIConfig,
  enforceOpenAIDailyBudget,
  enforceOpenAIRateLimit,
  estimateRequestTokens,
  getOpenAIGovernanceSnapshot,
  logOpenAIAudit,
  readUsageFromStreamChunk,
  withOpenAIRetry,
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
import { settleAIDailyBudget } from './aiBudget.js';
import { enforceIpRateLimit } from './requestRateLimit.js';
import { getRequestLogger, logWorkerBackgroundError, toWorkerError } from './logging.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const SETTLEMENT_INTENT_MAX_ATTEMPTS = 3;

class AIUsageAttemptPersistenceError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super('AI usage attempt could not be persisted');
    this.name = 'AIUsageAttemptPersistenceError';
    this.cause = cause;
  }
}

// 兼容层：部分上游按这两个键关闭思维链，OpenAI 官方类型里没有它们
const THINKING_DISABLED = { thinking: { type: 'disabled' }, enable_thinking: false };

const readCompletedContent = (
  content: string,
  finishReason: string | null | undefined,
  jsonResponse: boolean,
): unknown => {
  if (finishReason === 'length') {
    throw new DomainError(502, 'AI_OUTPUT_TRUNCATED', 'AI output exceeded the token limit');
  }
  if (finishReason !== 'stop') {
    throw new Error(`Incomplete AI completion: ${finishReason ?? 'missing finish reason'}`);
  }
  if (!content.trim()) throw new Error('Empty AI completion');
  if (!jsonResponse) return content;

  const value: unknown = JSON.parse(content);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('AI completion must be a JSON object');
  }
  return value;
};

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
  completeJson: (input: AICompletionInput) => Promise<unknown>;
  /** 流式补全：把增量直接写进响应，结算和审计在流结束或出错时完成。 */
  streamCompletion: (input: AIStreamInput) => Response;
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
export const withAIGovernance = async <Request>(
  c: Context<ApiEnv>,
  spec: AIRouteSpec<Request>,
  run: (session: AISession<Request>) => Promise<Response>,
): Promise<Response> => {
  const { route, maxOutputTokens } = spec;
  const config = buildOpenAIConfig(c.env);
  const requestId = getRequestId(c) ?? 'unknown';
  const startedAt = Date.now();
  const governance = getOpenAIGovernanceSnapshot(route, config);
  const waitUntil = c.executionCtx.waitUntil.bind(c.executionCtx);
  const model = c.env.OPENAI_MODEL_NAME || DEFAULT_MODEL;

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

  const audit = (
    status: number,
    retryCount: number,
    rateLimitHit: boolean,
    budgetHit: boolean,
    errorCode?: ApiErrorCode,
  ) => {
    logOpenAIAudit(
      c.env,
      {
        requestId,
        route,
        status,
        latencyMs: Date.now() - startedAt,
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
  };

  let user: AuthenticatedAppUser;
  try {
    user = await authenticateRequest(c);
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.status === 401 && config.rateLimitEnabled) {
        const limited = await enforceIpRateLimit(
          c,
          { scope: 'ai:anonymous', limit: 60, windowMs: 60_000 },
          'Too many unauthenticated AI requests',
        );
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
  auditUserId = user.userId;

  const parsedBody = await parseJsonBodyWithLimit<Record<string, unknown>>(c, spec.bodyMaxBytes);
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

  const rateLimit = await enforceOpenAIRateLimit(c, route, config, user.userId);
  rateLimitRemaining = rateLimit.remaining;
  if (rateLimit.response) {
    audit(429, 0, true, false, 'RATE_LIMIT_EXCEEDED');
    return rateLimit.response;
  }

  const messages = spec.buildMessages(parsed);
  estimatedTokens = estimateRequestTokens(messages, maxOutputTokens);

  const apiKey = c.env.OPENAI_API_KEY;
  if (!apiKey) {
    audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
    return errorResponse(c, 503, 'OpenAI service unavailable', 'SERVICE_UNAVAILABLE');
  }

  let reservation: AIUsageReservation;
  try {
    await grantSignupCredits(c.env, user);
    reservation = await reserveAIUsage(c.env, {
      userId: user.userId,
      routeKey: route,
      requestId,
      estimatedTokens,
    });
  } catch (error) {
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

  let requestAborted = false;

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
      ? settleAIDailyBudget(c.env, reservation.usageEventId, tokens)
      : Promise.resolve(null);

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

  const persistSettlementIntent = async (
    outcome: 'succeeded' | 'failed',
    settlement: AIUsageSettlement,
    code: ApiErrorCode | null,
  ) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= SETTLEMENT_INTENT_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await prepareAIUsageSettlement(c.env, reservation, outcome, settlement, code);
      } catch (error) {
        lastError = error;
        if (error instanceof DomainError) break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('AI usage settlement intent failed');
  };

  const settleUsage = async (outcome: 'succeeded' | 'failed', code: ApiErrorCode | null) => {
    const settlement = createSettlement();
    let prepared;
    try {
      prepared = await persistSettlementIntent(outcome, settlement, code);
      chargedTokens = prepared.chargedTokens;
      providerBudgetTokens = prepared.providerBudgetTokens;
      accountingSnapshotReliable = true;
    } catch (error) {
      reportSettlementError(error, 'credit_settlement_intent', outcome);
      return;
    }
    const [creditResult, budgetResult] = await Promise.allSettled([
      prepared.needsFinalization
        ? finalizeAIUsageSettlement(c.env, reservation, outcome, code)
        : Promise.resolve(false),
      settleBudget(prepared.providerBudgetTokens),
    ]);
    if (creditResult.status === 'rejected') {
      reportSettlementError(creditResult.reason, 'credit_settlement', outcome);
    } else {
      accountingFinalized = !prepared.needsFinalization || creditResult.value;
    }
    if (budgetResult.status === 'rejected') {
      reportSettlementError(budgetResult.reason, 'budget_settlement', outcome);
    } else if (budgetResult.value !== null) {
      budgetUsedTokens = budgetResult.value;
    }
  };

  try {
    const budget = await enforceOpenAIDailyBudget(
      c,
      reservation.usageEventId,
      estimatedTokens,
      config,
    );
    budgetUsedTokens = budget.usedTokens;
    if (budget.response) {
      await settleUsage('failed', 'BUDGET_EXCEEDED');
      audit(429, 0, false, true, 'BUDGET_EXCEEDED');
      return budget.response;
    }
  } catch (error) {
    await settleUsage('failed', 'SERVICE_UNAVAILABLE');
    getRequestLogger(c)?.error(toWorkerError(error, 'Budget reservation failed'), {
      ai: { failurePhase: 'budget_reservation' },
    });
    audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
    return errorResponse(c, 503, 'AI governance unavailable', 'SERVICE_UNAVAILABLE');
  }

  let settled = false;
  let terminalAudit: { status: number; errorCode?: ApiErrorCode } | null = null;
  let streamed = false;
  let streamAuditComplete = false;
  let retryCount = 0;
  const openai = new OpenAI({
    baseURL: c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey,
    maxRetries: 0,
    timeout: config.requestTimeoutMs,
  });
  const openAIAbortController = new AbortController();
  const reportUsage = (next: OpenAIUsageSnapshot | null | undefined) => {
    if (next) usage = next;
  };
  const runOpenAIAttempt = async <T>(operation: () => Promise<T>) => {
    try {
      attemptCount = await recordAIUsageAttempt(c.env, reservation);
    } catch (error) {
      throw new AIUsageAttemptPersistenceError(error);
    }
    retryCount = Math.max(0, attemptCount - 1);
    return operation();
  };
  const classifyFailure = (error: unknown) => {
    if (error instanceof AIUsageAttemptPersistenceError) {
      return {
        code: 'SERVICE_UNAVAILABLE' as const,
        status: 503 as const,
        message: 'AI usage service unavailable',
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
  const settleSuccess = async (completedRetryCount: number, streamResponse = false) => {
    if (settled) return;
    settled = true;
    terminalAudit = { status: 200 };
    await settleUsage('succeeded', null);
    if (!streamResponse || !requestAborted) {
      audit(200, completedRetryCount, false, false);
      if (streamResponse) streamAuditComplete = true;
    }
  };
  const settleFailure = async (
    code: ApiErrorCode,
    status: number,
    completedRetryCount: number,
    streamResponse = false,
  ) => {
    if (settled) return;
    settled = true;
    terminalAudit = { status, errorCode: code };
    await settleUsage('failed', code);
    if (!streamResponse || !requestAborted) {
      audit(status, completedRetryCount, false, false, code);
      if (streamResponse) streamAuditComplete = true;
    }
  };

  const session: AISession<Request> = {
    request: parsed,
    completeJson: async ({ scope, temperature }) => {
      const { data: response } = await withOpenAIRetry(
        () =>
          runOpenAIAttempt(() =>
            openai.chat.completions.create(
              {
                model,
                messages,
                response_format: { type: 'json_object' },
                temperature,
                max_tokens: maxOutputTokens,
                ...(THINKING_DISABLED as Record<string, unknown>),
              },
              { signal: openAIAbortController.signal },
            ),
          ),
        { scope, onRetry },
        config,
      );
      retryCount = Math.max(0, attemptCount - 1);
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
      try {
        return readCompletedContent(content, choice?.finish_reason, true);
      } catch (error) {
        getRequestLogger(c)?.error(toWorkerError(error, 'Completion validation failed'), {
          ai: {
            failurePhase: 'completion_validation',
            finishReason: choice?.finish_reason ?? null,
            contentLength: content.length,
          },
        });
        throw error;
      }
    },
    streamCompletion: ({ scope, temperature, jsonResponse, debugInput }) => {
      c.header('X-AI-Stream-Debug', config.streamDebugEnabled ? '1' : '0');
      streamed = true;
      let finishStream!: () => void;
      waitUntil(
        new Promise<void>((resolve) => {
          finishStream = resolve;
        }),
      );
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
      return stream(c, async (stream) => {
        streamDebug.start();
        let fullText = '';
        stream.onAbort(() => {
          requestAborted = true;
          openAIAbortController.abort();
          const settlementTask = settled
            ? null
            : settleFailure('UPSTREAM_OPENAI_ERROR', 499, retryCount, true);
          if (!streamAuditComplete) {
            const claimedAudit = terminalAudit ?? {
              status: 499,
              errorCode: 'UPSTREAM_OPENAI_ERROR' as const,
            };
            audit(claimedAudit.status, retryCount, false, false, claimedAudit.errorCode);
            streamAuditComplete = true;
          }
          if (!settlementTask) return;
          streamDebug.error(new Error('Client aborted AI stream'));
          waitUntil(settlementTask);
        });
        try {
          const { data: response } = await withOpenAIRetry(
            () =>
              runOpenAIAttempt(() =>
                openai.chat.completions.create(
                  {
                    model,
                    messages,
                    ...(jsonResponse ? { response_format: { type: 'json_object' as const } } : {}),
                    temperature,
                    max_tokens: maxOutputTokens,
                    stream: true,
                    stream_options: { include_usage: true },
                    ...(THINKING_DISABLED as Record<string, unknown>),
                  },
                  { signal: openAIAbortController.signal },
                ),
              ),
            { scope, onRetry },
            config,
          );
          retryCount = Math.max(0, attemptCount - 1);
          streamDebug.connected();

          let finishReason: string | null = null;
          for await (const chunk of response) {
            reportUsage(readUsageFromStreamChunk(chunk));
            const choice = chunk.choices[0];
            if (choice?.finish_reason) finishReason = choice.finish_reason;
            const content = choice?.delta?.content ?? '';
            if (content) {
              fullText += content;
              streamDebug.chunk(content);
              await stream.write(encodeAIStreamEvent({ type: 'delta', text: content }));
            }
          }

          readCompletedContent(fullText, finishReason, Boolean(jsonResponse));
          streamDebug.complete();
          await settleSuccess(retryCount, true);
          await stream.write(encodeAIStreamEvent({ type: 'done' }));
        } catch (error) {
          if (requestAborted) return;
          streamDebug.error(error);
          getRequestLogger(c)?.error(
            error instanceof Error ? error : new Error('Unknown stream error'),
            {
              ai: { failurePhase: 'stream' },
            },
          );
          const failure = classifyFailure(error);
          await settleFailure(failure.code, failure.status, retryCount, true);
          await stream.write(
            encodeAIStreamEvent({
              type: 'error',
              error: failure.message,
              code: failure.code,
              requestId,
            }),
          );
        } finally {
          finishStream();
        }
      });
    },
  };

  try {
    const response = await run(session);
    if (!streamed) await settleSuccess(retryCount);
    return response;
  } catch (error) {
    getRequestLogger(c)?.error(toWorkerError(error, 'AI request failed'), {
      ai: { failurePhase: 'request' },
    });
    const failure = classifyFailure(error);
    await settleFailure(failure.code, failure.status, retryCount);
    return errorResponse(c, failure.status, failure.message, failure.code);
  }
};
