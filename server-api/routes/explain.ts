import type { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import OpenAI from 'openai';
import type { ApiEnv } from '../lib/context.js';
import {
  enforceOpenAIDailyBudget,
  enforceOpenAIRateLimit,
  getOpenAIGovernanceSnapshot,
  estimateRequestTokens,
  logOpenAIAudit,
  withOpenAIRetry,
  buildOpenAIConfig,
} from '../openaiControl.js';
import {
  errorResponse,
  getRequestId,
  streamErrorPayload,
  type ApiErrorCode,
} from '../lib/http.js';
import {
  EXPLAIN_SYSTEM_PROMPT,
  buildExplainUserPrompt,
} from '../prompts/explain.js';
import { isAppLocale, type AppLocale } from '../../src/types/locale.js';

const MAX_OUTPUT_TOKENS = 1000;

export function registerExplainRoute(app: Hono<ApiEnv>) {
  app.post('/explain', async (c) => {
    const route = 'explain' as const;
    const config = buildOpenAIConfig(c.env);
    const requestId = getRequestId(c) ?? 'unknown';
    const startedAt = Date.now();
    const governance = getOpenAIGovernanceSnapshot(route, config);

    let estimatedTokens = 0;
    let rateLimitRemaining: number | null = governance.rateLimitLimit;
    let budgetUsedTokens: number | null = null;

    const audit = (
      status: number,
      retryCount: number,
      rateLimitHit: boolean,
      budgetHit: boolean,
      errorCode?: ApiErrorCode,
    ) => {
      logOpenAIAudit({
        requestId,
        route,
        status,
        latencyMs: Date.now() - startedAt,
        retryCount,
        rateLimitHit,
        estimatedTokens,
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
      });
    };

    const rateLimit = await enforceOpenAIRateLimit(c, route, config);
    rateLimitRemaining = rateLimit.remaining;
    if (rateLimit.response) {
      audit(429, 0, true, false, 'RATE_LIMIT_EXCEEDED');
      return rateLimit.response;
    }

    let body: { sql?: unknown; context?: unknown; locale?: unknown };
    try {
      body = await c.req.json();
    } catch {
      audit(400, 0, false, false, 'INVALID_JSON');
      return errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON');
    }

    const sql = typeof body.sql === 'string' ? body.sql : '';
    const context = typeof body.context === 'string' ? body.context : '';
    const locale: AppLocale = isAppLocale(body.locale) ? body.locale : 'zh-CN';

    if (sql.trim().length === 0) {
      audit(400, 0, false, false, 'SQL_REQUIRED');
      return errorResponse(c, 400, 'SQL is required', 'SQL_REQUIRED');
    }

    estimatedTokens = estimateRequestTokens(
      {
        sql,
        context,
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
      return errorResponse(
        c,
        503,
        'OpenAI service unavailable',
        'SERVICE_UNAVAILABLE',
      );
    }

    const openai = new OpenAI({
      baseURL,
      apiKey,
    });

    const userPrompt = buildExplainUserPrompt(sql, context, locale);
    const systemPrompt = EXPLAIN_SYSTEM_PROMPT[locale];

    return streamText(c, async (stream) => {
      let retryCount = 0;
      try {
        const { data: response, attempts } = await withOpenAIRetry(
          async () =>
            (await openai.chat.completions.create({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.3,
              max_tokens: MAX_OUTPUT_TOKENS,
              stream: true,
              ...({
                thinking: {
                  type: 'disabled',
                },
                enable_thinking: false,
              } as any),
            })) as any,
          { scope: 'Explain' },
          config,
        );

        retryCount = attempts;

        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            await stream.write(content);
          }
        }

        audit(200, retryCount, false, false);
      } catch {
        audit(502, retryCount, false, false, 'UPSTREAM_OPENAI_ERROR');
        await stream.write(
          streamErrorPayload(
            'Upstream OpenAI error',
            'UPSTREAM_OPENAI_ERROR',
            requestId,
          ),
        );
      }
    });
  });
}
