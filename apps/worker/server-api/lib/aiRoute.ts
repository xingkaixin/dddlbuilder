import type { Context } from 'hono';
import { stream } from 'hono/streaming';
import { encodeAIStreamEvent } from '@ddlbuilder/shared-types';
import OpenAI from 'openai';
import {
  type AIRouteKey,
  type AIUsageReservation,
  authenticateAIUser,
  completeAIUsage,
  failAIUsage,
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

const DEFAULT_MODEL = 'gpt-4o-mini';

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
 * 五条 AI 路由共用的前置流水线：限流 → 解析请求体 → 鉴权 → 估算 → 预留额度 → 预算，
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
        rateLimitHit,
        estimatedTokens,
        actualPromptTokens: usage?.promptTokens ?? null,
        actualCompletionTokens: usage?.completionTokens ?? null,
        actualTotalTokens: usage?.totalTokens ?? null,
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

  const rateLimit = await enforceOpenAIRateLimit(c, route, config);
  rateLimitRemaining = rateLimit.remaining;
  if (rateLimit.response) {
    audit(429, 0, true, false, 'RATE_LIMIT_EXCEEDED');
    return rateLimit.response;
  }

  const parsedBody = await parseJsonBodyWithLimit<Record<string, unknown>>(c, spec.bodyMaxBytes);
  if (parsedBody.errorResponse) {
    const tooLarge = parsedBody.errorResponse.status === 413;
    audit(
      parsedBody.errorResponse.status,
      0,
      false,
      false,
      tooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
    );
    return parsedBody.errorResponse;
  }

  const parsed = spec.parseRequest(parsedBody.data ?? {});
  if (isRejection(parsed)) {
    audit(parsed.status, 0, false, false, parsed.code);
    return errorResponse(c, parsed.status, parsed.message, parsed.code);
  }

  let userId: string;
  try {
    userId = (await authenticateAIUser(c)).userId;
  } catch (error) {
    // 鉴权失败也要落审计日志，所以这里不能直接把 DomainError 交给全局 onError
    if (error instanceof DomainError) {
      audit(error.status, 0, false, false, error.code);
      return errorResponse(c, error.status, error.message, error.code);
    }
    console.error(`[${route}] authentication failed`, error);
    audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
    return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
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
    reservation = await reserveAIUsage(c.env, {
      userId,
      routeKey: route,
      requestId,
      estimatedTokens,
    });
  } catch (error) {
    if (error instanceof DomainError) {
      audit(error.status, 0, false, false, error.code);
      return errorResponse(c, error.status, error.message, error.code);
    }
    console.error(`[${route}] credit reservation failed`, error);
    audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
    return errorResponse(c, 503, 'Credit service unavailable', 'SERVICE_UNAVAILABLE');
  }

  const settleBudget = (actualTokens: number | null) =>
    governance.budgetLimitTokens !== null
      ? settleAIDailyBudget(c.env, reservation.usageEventId, actualTokens)
      : Promise.resolve(null);

  const refund = async (code: ApiErrorCode) => {
    const [creditResult, budgetResult] = await Promise.allSettled([
      failAIUsage(c.env, reservation, code),
      settleBudget(0),
    ]);
    if (creditResult.status === 'rejected') {
      console.error(`[${route}] failed to refund credits`, creditResult.reason);
    }
    if (budgetResult.status === 'rejected') {
      console.error(`[${route}] failed to release budget`, budgetResult.reason);
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
      await refund('BUDGET_EXCEEDED');
      audit(429, 0, false, true, 'BUDGET_EXCEEDED');
      return budget.response;
    }
  } catch (error) {
    await refund('SERVICE_UNAVAILABLE');
    console.error(`[${route}] budget reservation failed`, error);
    audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
    return errorResponse(c, 503, 'AI governance unavailable', 'SERVICE_UNAVAILABLE');
  }

  let settled = false;
  // 流式响应在流结束前就会从 run 返回，包装器看到 streamed 就不能代为结算——那时 usage 还没读到
  let streamed = false;
  let retryCount = 0;
  const openai = new OpenAI({
    baseURL: c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey,
    maxRetries: 0,
    timeout: config.requestTimeoutMs,
  });
  const reportUsage = (next: OpenAIUsageSnapshot | null | undefined) => {
    if (next) usage = next;
  };
  const settleSuccess = (retryCount: number) => {
    if (settled) return;
    settled = true;
    // 结算晚于响应返回，必须挂 waitUntil，否则线上 isolate 提前结束会丢账
    const settlement = Promise.allSettled([
      completeAIUsage(c.env, reservation, usage?.totalTokens ?? null),
      settleBudget(usage?.totalTokens ?? null),
    ]).then(([creditResult, budgetResult]) => {
      if (creditResult.status === 'rejected') {
        console.error(`[${route}] credit settlement failed`, creditResult.reason);
      }
      if (budgetResult.status === 'rejected') {
        console.error(`[${route}] budget settlement failed`, budgetResult.reason);
      } else if (budgetResult.value !== null) {
        budgetUsedTokens = budgetResult.value;
      }
      audit(200, retryCount, false, false);
    });
    waitUntil(settlement);
  };
  const settleFailure = (code: ApiErrorCode, status: number, retryCount: number) => {
    if (settled) return;
    settled = true;
    const settlement = refund(code).then(() => audit(status, retryCount, false, false, code));
    waitUntil(settlement);
  };

  const session: AISession<Request> = {
    request: parsed,
    completeJson: async ({ scope, temperature }) => {
      const { data: response, attempts } = await withOpenAIRetry(
        async () =>
          openai.chat.completions.create({
            model,
            messages,
            response_format: { type: 'json_object' },
            temperature,
            max_tokens: maxOutputTokens,
            ...(THINKING_DISABLED as Record<string, unknown>),
          }),
        { scope },
        config,
      );
      retryCount = attempts;
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
      const content = response.choices[0]?.message?.content || '{}';
      try {
        return JSON.parse(content);
      } catch (error) {
        console.error(`[${route}] completion JSON parse failed`, {
          requestId,
          contentLength: content.length,
          error,
        });
        throw error;
      }
    },
    streamCompletion: ({ scope, temperature, jsonResponse, debugInput }) => {
      c.header('X-AI-Stream-Debug', config.streamDebugEnabled ? '1' : '0');
      streamed = true;
      const streamDebug = createOpenAIStreamDebugLogger({
        enabled: config.streamDebugEnabled,
        requestId,
        route,
        model,
        startedAt,
        input: debugInput,
      });

      c.header('Content-Type', 'application/x-ndjson; charset=utf-8');
      c.header('Cache-Control', 'no-cache');
      return stream(c, async (stream) => {
        streamDebug.start();
        try {
          const { data: response, attempts } = await withOpenAIRetry(
            async () =>
              (await openai.chat.completions.create({
                model,
                messages,
                ...(jsonResponse ? { response_format: { type: 'json_object' as const } } : {}),
                temperature,
                max_tokens: maxOutputTokens,
                stream: true,
                stream_options: { include_usage: true },
                ...(THINKING_DISABLED as Record<string, unknown>),
              })) as any,
            { scope },
            config,
          );
          retryCount = attempts;
          streamDebug.connected();

          for await (const chunk of response) {
            reportUsage(readUsageFromStreamChunk(chunk));
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              streamDebug.chunk(content);
              await stream.write(encodeAIStreamEvent({ type: 'delta', text: content }));
            }
          }

          await stream.write(encodeAIStreamEvent({ type: 'done' }));
          streamDebug.complete();
          settleSuccess(retryCount);
        } catch (error) {
          streamDebug.error(error);
          console.error(`[${route}] stream failed`, error);
          settleFailure('UPSTREAM_OPENAI_ERROR', 502, retryCount);
          await stream.write(
            encodeAIStreamEvent({
              type: 'error',
              error: 'Upstream OpenAI error',
              code: 'UPSTREAM_OPENAI_ERROR',
              requestId,
            }),
          );
        }
      });
    },
  };

  try {
    const response = await run(session);
    if (!streamed) settleSuccess(retryCount);
    return response;
  } catch (error) {
    console.error(`[${route}] failed`, error);
    settleFailure('UPSTREAM_OPENAI_ERROR', 502, retryCount);
    return errorResponse(c, 502, 'Upstream OpenAI error', 'UPSTREAM_OPENAI_ERROR');
  }
};
