import type { Context } from 'hono';
import { streamText } from 'hono/streaming';
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
  type OpenAIConfig,
  type OpenAIUsageSnapshot,
} from '../openaiControl.js';
import {
  errorResponse,
  getRequestId,
  parseJsonBodyWithLimit,
  streamErrorPayload,
  type ApiErrorCode,
} from './http.js';
import { createOpenAIStreamDebugLogger } from './aiStreamDebug.js';

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
 * 一次 AI 请求的治理句柄。额度在 reserve 时已经从账户扣走，所以每条退出路径都必须
 * 落到 succeed 或 fail 之一，否则那笔额度要等回收任务才还得回去。
 */
export type AISession<Request> = {
  request: Request;
  requestId: string;
  openai: OpenAI;
  model: string;
  maxOutputTokens: number;
  config: OpenAIConfig;
  startedAt: number;
  reportUsage: (usage: OpenAIUsageSnapshot | null | undefined) => void;
  /** 非流式补全：重试、usage 上报和 JSON 解析都在里面，调用方只拿结果和重试次数。 */
  completeJson: (input: AICompletionInput) => Promise<{ data: unknown; attempts: number }>;
  /** 流式补全：把增量直接写进响应，结算和审计在流结束或出错时完成。 */
  streamCompletion: (input: AIStreamInput) => Response;
  succeed: (retryCount: number) => Promise<void>;
  fail: (code: ApiErrorCode, status: number, retryCount: number) => Promise<void>;
};

export type AIChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type AIStreamInput = {
  messages: AIChatMessage[];
  scope: string;
  temperature: number;
  jsonResponse?: boolean;
  /** 只进 stream debug 日志，用来还原是什么输入触发了这次流。 */
  debugInput: Record<string, unknown>;
};

export type AICompletionInput = {
  system: string;
  user: string;
  scope: string;
  temperature: number;
};

export type AIRouteSpec<Request> = {
  route: AIRouteKey;
  maxOutputTokens: number;
  bodyMaxBytes: number;
  /** 返回 rejection 表示请求体不合法；估算 token 用的也是这里返回的对象。 */
  parseRequest: (body: Record<string, unknown>) => Request | AIRequestRejection;
};

const resolveWaitUntil = (c: Context<ApiEnv>) => {
  try {
    return c.executionCtx.waitUntil.bind(c.executionCtx);
  } catch {
    return undefined;
  }
};

/**
 * 五条 AI 路由共用的前置流水线：限流 → 解析请求体 → 鉴权 → 估算 → 预留额度 → 预算，
 * 任一步失败都会带上审计日志直接返回。走通之后把句柄交给 run，由它决定怎么调模型、
 * 怎么回包——流式路由会在 streamText 回调里才结算，所以结算时机必须留给 run 自己。
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
  const waitUntil = resolveWaitUntil(c);
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
    if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
      audit(401, 0, false, false, 'AUTH_REQUIRED');
      return errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED');
    }
    console.error(`[${route}] authentication failed`, error);
    audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
    return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
  }

  estimatedTokens = estimateRequestTokens(parsed, maxOutputTokens);

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
    if (error instanceof Error && error.message === 'CREDIT_EXHAUSTED') {
      audit(402, 0, false, false, 'CREDIT_EXHAUSTED');
      return errorResponse(c, 402, 'Insufficient credits', 'CREDIT_EXHAUSTED');
    }
    console.error(`[${route}] credit reservation failed`, error);
    audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
    return errorResponse(c, 503, 'Credit service unavailable', 'SERVICE_UNAVAILABLE');
  }

  const refund = async (code: ApiErrorCode) => {
    try {
      await failAIUsage(c.env, reservation, code);
    } catch (error) {
      console.error(`[${route}] failed to refund credits`, error);
    }
  };

  try {
    const budget = await enforceOpenAIDailyBudget(c, estimatedTokens, config);
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

  const session: AISession<Request> = {
    request: parsed,
    requestId,
    openai: new OpenAI({ baseURL: c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', apiKey }),
    model,
    maxOutputTokens,
    config,
    startedAt,
    reportUsage: (next) => {
      if (next) usage = next;
    },
    completeJson: async ({ system, user, scope, temperature }) => {
      const { data: response, attempts } = await withOpenAIRetry(
        async () =>
          session.openai.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            response_format: { type: 'json_object' },
            temperature,
            max_tokens: maxOutputTokens,
            ...(THINKING_DISABLED as Record<string, unknown>),
          }),
        { scope },
        config,
      );
      const usageSnapshot = response.usage;
      session.reportUsage(
        usageSnapshot
          ? {
              promptTokens: usageSnapshot.prompt_tokens,
              completionTokens: usageSnapshot.completion_tokens,
              totalTokens: usageSnapshot.total_tokens,
            }
          : null,
      );
      return { data: JSON.parse(response.choices[0]?.message?.content || '{}'), attempts };
    },
    streamCompletion: ({ messages, scope, temperature, jsonResponse, debugInput }) => {
      c.header('X-AI-Stream-Debug', config.streamDebugEnabled ? '1' : '0');
      const streamDebug = createOpenAIStreamDebugLogger({
        enabled: config.streamDebugEnabled,
        requestId,
        route,
        model,
        startedAt,
        input: debugInput,
      });

      return streamText(c, async (stream) => {
        let retryCount = 0;
        streamDebug.start();
        try {
          const { data: response, attempts } = await withOpenAIRetry(
            async () =>
              (await session.openai.chat.completions.create({
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
            session.reportUsage(readUsageFromStreamChunk(chunk));
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              streamDebug.chunk(content);
              await stream.write(content);
            }
          }

          streamDebug.complete();
          await session.succeed(retryCount);
        } catch (error) {
          streamDebug.error(error);
          console.error(`[${route}] stream failed`, error);
          await session.fail('UPSTREAM_OPENAI_ERROR', 502, retryCount);
          await stream.write(
            streamErrorPayload('Upstream OpenAI error', 'UPSTREAM_OPENAI_ERROR', requestId),
          );
        }
      });
    },
    succeed: async (retryCount) => {
      await completeAIUsage(c.env, reservation, usage?.totalTokens ?? null);
      audit(200, retryCount, false, false);
    },
    fail: async (code, status, retryCount) => {
      await refund(code);
      audit(status, retryCount, false, false, code);
    },
  };

  try {
    return await run(session);
  } catch (error) {
    console.error(`[${route}] failed`, error);
    await session.fail('UPSTREAM_OPENAI_ERROR', 502, 0);
    return errorResponse(c, 502, 'Upstream OpenAI error', 'UPSTREAM_OPENAI_ERROR');
  }
};
