import type { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import OpenAI from 'openai';
import {
  enforceOpenAIDailyBudget,
  enforceOpenAIRateLimit,
  getOpenAIGovernanceSnapshot,
  estimateRequestTokens,
  logOpenAIAudit,
  withOpenAIRetry,
} from '../openaiControl.js';
import {
  errorResponse,
  getRequestId,
  streamErrorPayload,
  type ApiErrorCode,
} from '../lib/http.js';
import {
  REVIEW_SYSTEM_PROMPT,
  buildReviewUserPrompt,
} from '../prompts/review.js';

const MAX_OUTPUT_TOKENS = 2000;

export function registerReviewRoute(app: Hono) {
  app.post('/review', async (c) => {
    const route = 'review' as const;
    const requestId = getRequestId(c) ?? 'unknown';
    const startedAt = Date.now();
    const governance = getOpenAIGovernanceSnapshot(route);

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
        model: process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini',
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

    const rateLimit = await enforceOpenAIRateLimit(c, route);
    rateLimitRemaining = rateLimit.remaining;
    if (rateLimit.response) {
      audit(429, 0, true, false, 'RATE_LIMIT_EXCEEDED');
      return rateLimit.response;
    }

    let body: { ddl?: unknown; tableName?: unknown; dbType?: unknown };
    try {
      body = await c.req.json();
    } catch {
      audit(400, 0, false, false, 'INVALID_JSON');
      return errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON');
    }

    const ddl = typeof body.ddl === 'string' ? body.ddl : '';
    const tableName = typeof body.tableName === 'string' ? body.tableName : '';
    const dbType = typeof body.dbType === 'string' ? body.dbType : '';

    if (ddl.trim().length === 0) {
      audit(400, 0, false, false, 'DDL_REQUIRED');
      return errorResponse(c, 400, 'DDL is required', 'DDL_REQUIRED');
    }

    estimatedTokens = estimateRequestTokens(
      {
        ddl,
        tableName,
        dbType,
      },
      MAX_OUTPUT_TOKENS,
    );

    const budget = await enforceOpenAIDailyBudget(c, estimatedTokens);
    budgetUsedTokens = budget.usedTokens;
    if (budget.response) {
      audit(429, 0, false, true, 'BUDGET_EXCEEDED');
      return budget.response;
    }

    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini';

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

    const userPrompt = buildReviewUserPrompt(ddl, tableName, dbType);

    return streamText(c, async (stream) => {
      let retryCount = 0;
      try {
        const { data: response, attempts } = await withOpenAIRetry(
          async () =>
            (await openai.chat.completions.create({
              model,
              messages: [
                { role: 'system', content: REVIEW_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.3,
              max_tokens: MAX_OUTPUT_TOKENS,
              stream: true,
              ...({
                thinking: {
                  type: 'disabled',
                },
              } as any),
            })) as any,
          { scope: 'Review' },
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
