import type { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import OpenAI from 'openai';
import {
  enforceOpenAIDailyBudget,
  enforceOpenAIRateLimit,
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
  EXPLAIN_SYSTEM_PROMPT,
  buildExplainUserPrompt,
} from '../prompts/explain.js';

const MAX_OUTPUT_TOKENS = 1000;

export function registerExplainRoute(app: Hono) {
  app.post('/explain', async (c) => {
    const route = 'explain' as const;
    const requestId = getRequestId(c) ?? 'unknown';
    const startedAt = Date.now();

    let estimatedTokens = 0;

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
        budgetHit,
        errorCode,
      });
    };

    const rateLimit = await enforceOpenAIRateLimit(c, route);
    if (rateLimit.response) {
      audit(429, 0, true, false, 'RATE_LIMIT_EXCEEDED');
      return rateLimit.response;
    }

    let body: { sql?: unknown; context?: unknown };
    try {
      body = await c.req.json();
    } catch {
      audit(400, 0, false, false, 'INVALID_JSON');
      return errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON');
    }

    const sql = typeof body.sql === 'string' ? body.sql : '';
    const context = typeof body.context === 'string' ? body.context : '';

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

    const budget = await enforceOpenAIDailyBudget(c, estimatedTokens);
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

    const userPrompt = buildExplainUserPrompt(sql, context);

    return streamText(c, async (stream) => {
      let retryCount = 0;
      try {
        const { data: response, attempts } = await withOpenAIRetry(
          async () =>
            (await openai.chat.completions.create({
              model,
              messages: [
                { role: 'system', content: EXPLAIN_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.3,
              max_tokens: MAX_OUTPUT_TOKENS,
              stream: true,
              ...({
                thinking: {
                  type: 'disabled',
                },
              } as any),
            })) as any,
          { scope: 'Explain' },
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
