import type { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import OpenAI from 'openai';
import {
  authenticateAIUser,
  completeAIUsage,
  failAIUsage,
  reserveAIUsage,
} from '../lib/aiUsage.js';
import type { ApiEnv } from '../lib/context.js';
import { createOpenAIStreamDebugLogger } from '../lib/aiStreamDebug.js';
import {
  enforceOpenAIDailyBudget,
  enforceOpenAIRateLimit,
  getOpenAIGovernanceSnapshot,
  estimateRequestTokens,
  logOpenAIAudit,
  readUsageFromStreamChunk,
  withOpenAIRetry,
  buildOpenAIConfig,
} from '../openaiControl.js';
import { errorResponse, getRequestId, streamErrorPayload, type ApiErrorCode } from '../lib/http.js';
import {
  buildGenerateTableMessages,
  buildGenerateTableSystemPrompt,
} from '../prompts/generateTable.js';
import { isAppLocale, type AppLocale } from '../../src/types/locale.js';

const MAX_OUTPUT_TOKENS = 4000;

export function registerGenerateTableRoute(app: Hono<ApiEnv>) {
  app.post('/generate-table', async (c) => {
    const route = 'generate-table' as const;
    const config = buildOpenAIConfig(c.env);
    const requestId = getRequestId(c) ?? 'unknown';
    const startedAt = Date.now();
    const governance = getOpenAIGovernanceSnapshot(route, config);

    let estimatedTokens = 0;
    let actualPromptTokens: number | null = null;
    let actualCompletionTokens: number | null = null;
    let actualTotalTokens: number | null = null;
    let rateLimitRemaining: number | null = governance.rateLimitLimit;
    let budgetUsedTokens: number | null = null;
    let reservation: {
      usageEventId: string;
      userId: string;
      routeKey: 'generate-table';
      requestId: string;
      reservedTokens: number;
    } | null = null;
    let currentUserId: string | null = null;
    let waitUntil: ((promise: Promise<unknown>) => void) | undefined;

    try {
      waitUntil = c.executionCtx.waitUntil.bind(c.executionCtx);
    } catch {
      waitUntil = undefined;
    }

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
          actualPromptTokens,
          actualCompletionTokens,
          actualTotalTokens,
          model: c.env.OPENAI_MODEL_NAME || 'gpt-4o-mini',
          maxOutputTokens: MAX_OUTPUT_TOKENS,
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

    let body: {
      description?: unknown;
      dbType?: unknown;
      locale?: unknown;
      templates?: unknown;
      existingConfig?: unknown;
      conversationHistory?: unknown;
    };

    try {
      body = await c.req.json();
    } catch {
      audit(400, 0, false, false, 'INVALID_JSON');
      return errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON');
    }

    const description = typeof body.description === 'string' ? body.description : '';
    const dbType = typeof body.dbType === 'string' ? body.dbType : '';
    const locale: AppLocale = isAppLocale(body.locale) ? body.locale : 'zh-CN';
    const templates = Array.isArray(body.templates) ? body.templates : [];
    const existingConfig = body.existingConfig;
    const conversationHistory = Array.isArray(body.conversationHistory)
      ? body.conversationHistory
      : [];

    if (description.trim().length === 0) {
      audit(400, 0, false, false, 'DESCRIPTION_REQUIRED');
      return errorResponse(c, 400, 'Description is required', 'DESCRIPTION_REQUIRED');
    }

    try {
      const user = await authenticateAIUser(c);
      currentUserId = user.appUserId;
    } catch (error) {
      if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
        audit(401, 0, false, false, 'AUTH_REQUIRED');
        return errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED');
      }
      if (error instanceof Error && error.message === 'INVALID_AUTH_TOKEN') {
        audit(401, 0, false, false, 'INVALID_AUTH_TOKEN');
        return errorResponse(c, 401, 'Invalid or expired access token', 'INVALID_AUTH_TOKEN');
      }
      if (error instanceof Error && error.message === 'USER_DISABLED') {
        audit(403, 0, false, false, 'USER_DISABLED');
        return errorResponse(c, 403, 'User account is disabled', 'USER_DISABLED');
      }
      console.error('[generate-table] authentication failed', error);
      audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }

    estimatedTokens = estimateRequestTokens(
      {
        description,
        dbType,
        locale,
        templates,
        existingConfig,
        conversationHistory,
      },
      MAX_OUTPUT_TOKENS,
    );

    const budget = await enforceOpenAIDailyBudget(c, estimatedTokens, config);
    budgetUsedTokens = budget.usedTokens;
    if (budget.response) {
      audit(429, 0, false, true, 'BUDGET_EXCEEDED');
      return budget.response;
    }

    const baseURL = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const apiKey = c.env.OPENAI_API_KEY;
    const model = c.env.OPENAI_MODEL_NAME || 'gpt-4o-mini';

    if (!apiKey) {
      audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
      return errorResponse(c, 503, 'OpenAI service unavailable', 'SERVICE_UNAVAILABLE');
    }

    if (!currentUserId) {
      audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }

    try {
      reservation = await reserveAIUsage(c.env, {
        userId: currentUserId,
        routeKey: route,
        requestId,
        estimatedTokens,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'CREDIT_EXHAUSTED') {
        audit(402, 0, false, false, 'CREDIT_EXHAUSTED');
        return errorResponse(c, 402, 'Insufficient credits', 'CREDIT_EXHAUSTED');
      }
      console.error('[generate-table] credit reservation failed', error);
      audit(503, 0, false, false, 'SERVICE_UNAVAILABLE');
      return errorResponse(c, 503, 'Credit service unavailable', 'SERVICE_UNAVAILABLE');
    }

    const openai = new OpenAI({
      baseURL,
      apiKey,
    });

    const systemPrompt = buildGenerateTableSystemPrompt({
      dbType,
      locale,
      templates,
      existingConfig,
    });

    const messages = buildGenerateTableMessages({
      systemPrompt,
      description,
      conversationHistory,
    });
    c.header('X-AI-Stream-Debug', config.streamDebugEnabled ? '1' : '0');
    const streamDebug = createOpenAIStreamDebugLogger({
      enabled: config.streamDebugEnabled,
      requestId,
      route,
      model,
      startedAt,
      input: {
        descriptionLength: description.length,
        dbType,
        locale,
        templateCount: templates.length,
        hasExistingConfig: existingConfig != null,
        conversationTurnCount: conversationHistory.length,
      },
    });

    return streamText(c, async (stream) => {
      let retryCount = 0;
      streamDebug.start();
      try {
        const { data: response, attempts } = await withOpenAIRetry(
          async () =>
            (await openai.chat.completions.create({
              model,
              messages,
              response_format: { type: 'json_object' },
              temperature: 0.3,
              max_tokens: MAX_OUTPUT_TOKENS,
              stream: true,
              stream_options: {
                include_usage: true,
              },
              ...({
                thinking: {
                  type: 'disabled',
                },
                enable_thinking: false,
              } as any),
            })) as any,
          { scope: 'GenerateTable' },
          config,
        );

        retryCount = attempts;
        streamDebug.connected();

        for await (const chunk of response) {
          const usage = readUsageFromStreamChunk(chunk);
          if (usage) {
            actualPromptTokens = usage.promptTokens;
            actualCompletionTokens = usage.completionTokens;
            actualTotalTokens = usage.totalTokens;
          }

          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            streamDebug.chunk(content);
            await stream.write(content);
          }
        }

        streamDebug.complete();
        if (reservation) {
          await completeAIUsage(c.env, reservation, actualTotalTokens);
        }
        audit(200, retryCount, false, false);
      } catch (error) {
        streamDebug.error(error);
        if (reservation) {
          try {
            await failAIUsage(c.env, reservation, 'UPSTREAM_OPENAI_ERROR');
          } catch (refundError) {
            console.error(
              '[generate-table] failed to refund credits after upstream error',
              refundError,
            );
          }
        }
        audit(502, retryCount, false, false, 'UPSTREAM_OPENAI_ERROR');
        await stream.write(
          streamErrorPayload('Upstream OpenAI error', 'UPSTREAM_OPENAI_ERROR', requestId),
        );
      }
    });
  });
}
