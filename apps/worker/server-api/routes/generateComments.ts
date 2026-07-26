import type { Hono } from 'hono';
import OpenAI from 'openai';
import {
  authenticateAIUser,
  completeAIUsage,
  failAIUsage,
  reserveAIUsage,
} from '../lib/aiUsage.js';
import type { ApiEnv } from '../lib/context.js';
import {
  buildOpenAIConfig,
  enforceOpenAIDailyBudget,
  enforceOpenAIRateLimit,
  estimateRequestTokens,
  getOpenAIGovernanceSnapshot,
  logOpenAIAudit,
  withOpenAIRetry,
} from '../openaiControl.js';
import {
  errorResponse,
  getRequestId,
  parseJsonBodyWithLimit,
  withMeta,
  type ApiErrorCode,
} from '../lib/http.js';
import {
  GENERATE_COMMENTS_SYSTEM_PROMPT,
  buildGenerateCommentsUserPrompt,
} from '../prompts/generateComments.js';
import { isAppLocale, type AppLocale } from '@ddlbuilder/shared-types/locale';
import type {
  AICommentFieldInput,
  AICommentRequest,
  AICommentResult,
} from '@ddlbuilder/shared-types/ai-generate';

const REQUEST_BODY_MAX_BYTES = 1024 * 1024;

const MAX_OUTPUT_TOKENS = 1800;

const isCommentMode = (value: unknown): value is AICommentRequest['mode'] =>
  value === 'fill_missing' || value === 'translate';

const normalizeFields = (value: unknown): AICommentFieldInput[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const field = item as Record<string, unknown>;
      const fieldName = typeof field.fieldName === 'string' ? field.fieldName.trim() : '';
      const fieldType = typeof field.fieldType === 'string' ? field.fieldType.trim() : '';
      const fieldComment = typeof field.fieldComment === 'string' ? field.fieldComment.trim() : '';
      if (!fieldName) return null;
      return { fieldName, fieldType, fieldComment };
    })
    .filter((item): item is AICommentFieldInput => item !== null);
};

const normalizeResult = (payload: unknown, fields: AICommentFieldInput[]): AICommentResult => {
  const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const resultFields = Array.isArray(data.fields) ? data.fields : [];
  const byName = new Map<string, string>();

  resultFields.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const field = item as Record<string, unknown>;
    if (typeof field.fieldName !== 'string' || typeof field.fieldComment !== 'string') return;
    byName.set(field.fieldName, field.fieldComment.trim());
  });

  return {
    tableComment: typeof data.tableComment === 'string' ? data.tableComment.trim() : '',
    fields: fields.map((field) => ({
      fieldName: field.fieldName,
      fieldComment: byName.get(field.fieldName) ?? '',
    })),
  };
};

export function registerGenerateCommentsRoute(app: Hono<ApiEnv>) {
  app.post('/generate-comments', async (c) => {
    const route = 'generate-comments' as const;
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
    let retryCount = 0;
    let reservation: {
      usageEventId: string;
      userId: string;
      routeKey: 'generate-comments';
      requestId: string;
      reservedTokens: number;
    } | null = null;
    let waitUntil: ((promise: Promise<unknown>) => void) | undefined;

    try {
      waitUntil = c.executionCtx.waitUntil.bind(c.executionCtx);
    } catch {
      waitUntil = undefined;
    }

    const audit = (
      status: number,
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
      audit(429, true, false, 'RATE_LIMIT_EXCEEDED');
      return rateLimit.response;
    }

    const parsedBody = await parseJsonBodyWithLimit<Record<string, unknown>>(
      c,
      REQUEST_BODY_MAX_BYTES,
    );
    if (parsedBody.errorResponse) {
      audit(
        parsedBody.errorResponse.status,
        false,
        false,
        parsedBody.errorResponse.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
      );
      return parsedBody.errorResponse;
    }
    const body = parsedBody.data ?? {};

    const fields = normalizeFields(body.fields);
    const tableName = typeof body.tableName === 'string' ? body.tableName.trim() : '';
    if (!tableName || fields.length === 0) {
      audit(400, false, false, 'SCHEMA_REQUIRED');
      return errorResponse(c, 400, 'Table schema is required', 'SCHEMA_REQUIRED');
    }

    let currentUserId: string;
    try {
      const user = await authenticateAIUser(c);
      currentUserId = user.userId;
    } catch (error) {
      if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
        audit(401, false, false, 'AUTH_REQUIRED');
        return errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED');
      }
      console.error('[generate-comments] authentication failed', error);
      audit(503, false, false, 'SERVICE_UNAVAILABLE');
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }

    const request: AICommentRequest = {
      mode: isCommentMode(body.mode) ? body.mode : 'fill_missing',
      targetLocale: isAppLocale(body.targetLocale) ? (body.targetLocale as AppLocale) : 'zh-CN',
      schemaName: typeof body.schemaName === 'string' ? body.schemaName.trim() : undefined,
      tableName,
      tableComment: typeof body.tableComment === 'string' ? body.tableComment.trim() : '',
      fields,
    };

    estimatedTokens = estimateRequestTokens(request, MAX_OUTPUT_TOKENS);
    const apiKey = c.env.OPENAI_API_KEY;
    if (!apiKey) {
      audit(503, false, false, 'SERVICE_UNAVAILABLE');
      return errorResponse(c, 503, 'OpenAI service unavailable', 'SERVICE_UNAVAILABLE');
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
        audit(402, false, false, 'CREDIT_EXHAUSTED');
        return errorResponse(c, 402, 'Insufficient credits', 'CREDIT_EXHAUSTED');
      }
      console.error('[generate-comments] credit reservation failed', error);
      audit(503, false, false, 'SERVICE_UNAVAILABLE');
      return errorResponse(c, 503, 'Credit service unavailable', 'SERVICE_UNAVAILABLE');
    }

    try {
      const budget = await enforceOpenAIDailyBudget(c, estimatedTokens, config);
      budgetUsedTokens = budget.usedTokens;
      if (budget.response) {
        await failAIUsage(c.env, reservation, 'BUDGET_EXCEEDED');
        audit(429, false, true, 'BUDGET_EXCEEDED');
        return budget.response;
      }
    } catch (error) {
      await failAIUsage(c.env, reservation, 'SERVICE_UNAVAILABLE');
      console.error('[generate-comments] budget reservation failed', error);
      audit(503, false, false, 'SERVICE_UNAVAILABLE');
      return errorResponse(c, 503, 'AI governance unavailable', 'SERVICE_UNAVAILABLE');
    }

    const openai = new OpenAI({
      baseURL: c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey,
    });

    try {
      const { data: response, attempts } = await withOpenAIRetry(
        async () =>
          openai.chat.completions.create({
            model: c.env.OPENAI_MODEL_NAME || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: GENERATE_COMMENTS_SYSTEM_PROMPT },
              {
                role: 'user',
                content: buildGenerateCommentsUserPrompt(request),
              },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
            max_tokens: MAX_OUTPUT_TOKENS,
            ...({
              thinking: {
                type: 'disabled',
              },
              enable_thinking: false,
            } as any),
          }),
        { scope: 'GenerateComments' },
        config,
      );
      retryCount = attempts;

      const usage = response.usage;
      actualPromptTokens = usage?.prompt_tokens ?? null;
      actualCompletionTokens = usage?.completion_tokens ?? null;
      actualTotalTokens = usage?.total_tokens ?? null;

      const content = response.choices[0]?.message?.content || '{}';
      const result = normalizeResult(JSON.parse(content), fields);
      if (reservation) {
        await completeAIUsage(c.env, reservation, actualTotalTokens);
      }
      audit(200, false, false);
      return c.json(withMeta(c, result));
    } catch (error) {
      if (reservation) {
        try {
          await failAIUsage(c.env, reservation, 'UPSTREAM_OPENAI_ERROR');
        } catch (refundError) {
          console.error(
            '[generate-comments] failed to refund credits after upstream error',
            refundError,
          );
        }
      }
      console.error('[generate-comments] failed', error);
      audit(502, false, false, 'UPSTREAM_OPENAI_ERROR');
      return errorResponse(c, 502, 'Upstream OpenAI error', 'UPSTREAM_OPENAI_ERROR');
    }
  });
}
