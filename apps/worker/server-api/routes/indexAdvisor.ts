import type { Hono } from 'hono';
import OpenAI from 'openai';
import {
  authenticateAIUser,
  completeAIUsage,
  failAIUsage,
  reserveAIUsage,
  type AIUsageReservation,
} from '../lib/aiUsage.js';
import type { ApiEnv } from '../lib/context.js';
import {
  errorResponse,
  getRequestId,
  parseJsonBodyWithLimit,
  withMeta,
  type ApiErrorCode,
} from '../lib/http.js';
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
  INDEX_ADVISOR_SYSTEM_PROMPT,
  buildIndexAdvisorUserPrompt,
} from '../prompts/indexAdvisor.js';
import type {
  AIIndexAdvisorFieldInput,
  AIIndexAdvisorIndexInput,
  AIIndexAdvisorRecommendation,
  AIIndexAdvisorRecommendationCategory,
  AIIndexAdvisorRequest,
  AIIndexAdvisorResult,
} from '@ddlbuilder/shared-types/ai-generate';

const MAX_OUTPUT_TOKENS = 2200;
const MAX_REQUEST_BYTES = 64_000;
const MAX_QUERY_PATTERNS_LENGTH = 20_000;

const RECOMMENDATION_CATEGORIES = new Set<AIIndexAdvisorRecommendationCategory>([
  'missing_index',
  'redundant_index',
  'order_optimization',
  'query_rewrite',
  'general',
]);

const normalizeFields = (value: unknown): AIIndexAdvisorFieldInput[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): AIIndexAdvisorFieldInput | null => {
      if (!item || typeof item !== 'object') return null;
      const field = item as Record<string, unknown>;
      const fieldName = typeof field.fieldName === 'string' ? field.fieldName.trim() : '';
      const fieldType = typeof field.fieldType === 'string' ? field.fieldType.trim() : '';
      const fieldComment = typeof field.fieldComment === 'string' ? field.fieldComment.trim() : '';
      if (!fieldName) return null;
      return {
        fieldName,
        fieldType,
        fieldComment,
        nullable: field.nullable === true,
      };
    })
    .filter((item): item is AIIndexAdvisorFieldInput => item !== null);
};

const normalizeIndexes = (value: unknown): AIIndexAdvisorIndexInput[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): AIIndexAdvisorIndexInput | null => {
      if (!item || typeof item !== 'object') return null;
      const index = item as Record<string, unknown>;
      const name = typeof index.name === 'string' ? index.name.trim() : '';
      const rawFields = Array.isArray(index.fields) ? index.fields : [];
      const fields = rawFields
        .map((rawField) => {
          if (!rawField || typeof rawField !== 'object') return null;
          const field = rawField as Record<string, unknown>;
          const fieldName = typeof field.name === 'string' ? field.name.trim() : '';
          if (!fieldName) return null;
          return {
            name: fieldName,
            direction: field.direction === 'DESC' ? ('DESC' as const) : ('ASC' as const),
          };
        })
        .filter((field): field is AIIndexAdvisorIndexInput['fields'][number] => field !== null);
      if (!name || fields.length === 0) return null;
      return {
        name,
        fields,
        unique: index.unique === true,
        isPrimary: index.isPrimary === true,
      };
    })
    .filter((item): item is AIIndexAdvisorIndexInput => item !== null);
};

const normalizeResult = (
  payload: unknown,
  fields: AIIndexAdvisorFieldInput[],
): AIIndexAdvisorResult => {
  const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const fieldNames = new Set(fields.map((field) => field.fieldName));
  const rawRecommendations = Array.isArray(data.recommendations) ? data.recommendations : [];

  const recommendations = rawRecommendations
    .map((item, index): AIIndexAdvisorRecommendation | null => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;
      const category = raw.category;
      const title = typeof raw.title === 'string' ? raw.title.trim() : '';
      const rationale = typeof raw.rationale === 'string' ? raw.rationale.trim() : '';
      if (
        typeof category !== 'string' ||
        !RECOMMENDATION_CATEGORIES.has(category as AIIndexAdvisorRecommendationCategory) ||
        !title ||
        !rationale
      ) {
        return null;
      }

      let recommendedIndex: AIIndexAdvisorIndexInput | undefined;
      const rawIndex =
        raw.index && typeof raw.index === 'object' ? (raw.index as Record<string, unknown>) : null;
      if (rawIndex) {
        const name = typeof rawIndex.name === 'string' ? rawIndex.name.trim() : '';
        const rawIndexFields = Array.isArray(rawIndex.fields) ? rawIndex.fields : [];
        const indexFields = rawIndexFields
          .map((rawField) => {
            if (!rawField || typeof rawField !== 'object') return null;
            const field = rawField as Record<string, unknown>;
            const fieldName = typeof field.name === 'string' ? field.name.trim() : '';
            if (!fieldNames.has(fieldName)) return null;
            return {
              name: fieldName,
              direction: field.direction === 'DESC' ? ('DESC' as const) : ('ASC' as const),
            };
          })
          .filter((field): field is AIIndexAdvisorIndexInput['fields'][number] => field !== null);
        if (name && indexFields.length > 0) {
          recommendedIndex = {
            name,
            fields: indexFields,
            unique: rawIndex.unique === true,
          };
        }
      }

      return {
        id: `rec_${index + 1}`,
        category: category as AIIndexAdvisorRecommendationCategory,
        title,
        rationale,
        confidence:
          raw.confidence === 'high' || raw.confidence === 'low' ? raw.confidence : 'medium',
        ...(recommendedIndex ? { index: recommendedIndex } : {}),
        ...(typeof raw.targetIndexName === 'string' && raw.targetIndexName.trim()
          ? { targetIndexName: raw.targetIndexName.trim() }
          : {}),
        ...(Array.isArray(raw.affectedQueries)
          ? {
              affectedQueries: raw.affectedQueries
                .filter(
                  (query): query is string => typeof query === 'string' && query.trim().length > 0,
                )
                .map((query) => query.trim())
                .slice(0, 5),
            }
          : {}),
      };
    })
    .filter((item): item is AIIndexAdvisorRecommendation => item !== null);

  return {
    summary: typeof data.summary === 'string' ? data.summary.trim() : '',
    recommendations,
  };
};

export function registerIndexAdvisorRoute(app: Hono<ApiEnv>) {
  app.post('/index-advisor', async (c) => {
    const route = 'index-advisor' as const;
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
    let reservation: AIUsageReservation | null = null;
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

    const { data: body, errorResponse: bodyError } = await parseJsonBodyWithLimit<
      Record<string, unknown>
    >(c, MAX_REQUEST_BYTES);
    if (bodyError) {
      audit(
        bodyError.status,
        false,
        false,
        bodyError.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
      );
      return bodyError;
    }
    if (!body) {
      audit(400, false, false, 'INVALID_JSON');
      return errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON');
    }

    const fields = normalizeFields(body.fields);
    const tableName = typeof body.tableName === 'string' ? body.tableName.trim() : '';
    const queryPatterns = typeof body.queryPatterns === 'string' ? body.queryPatterns.trim() : '';
    if (!tableName || fields.length === 0) {
      audit(400, false, false, 'SCHEMA_REQUIRED');
      return errorResponse(c, 400, 'Table schema is required', 'SCHEMA_REQUIRED');
    }
    if (!queryPatterns || queryPatterns.length > MAX_QUERY_PATTERNS_LENGTH) {
      audit(400, false, false, 'SQL_REQUIRED');
      return errorResponse(c, 400, 'Query patterns are required', 'SQL_REQUIRED');
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
      console.error('[index-advisor] authentication failed', error);
      audit(503, false, false, 'SERVICE_UNAVAILABLE');
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }

    const request: AIIndexAdvisorRequest = {
      dbType: typeof body.dbType === 'string' ? body.dbType.trim() : 'mysql',
      schemaName: typeof body.schemaName === 'string' ? body.schemaName.trim() : undefined,
      tableName,
      tableComment: typeof body.tableComment === 'string' ? body.tableComment.trim() : '',
      fields,
      indexes: normalizeIndexes(body.indexes),
      queryPatterns,
    };

    estimatedTokens = estimateRequestTokens(request, MAX_OUTPUT_TOKENS);
    const budget = await enforceOpenAIDailyBudget(c, estimatedTokens, config);
    budgetUsedTokens = budget.usedTokens;
    if (budget.response) {
      audit(429, false, true, 'BUDGET_EXCEEDED');
      return budget.response;
    }

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
      console.error('[index-advisor] credit reservation failed', error);
      audit(503, false, false, 'SERVICE_UNAVAILABLE');
      return errorResponse(c, 503, 'Credit service unavailable', 'SERVICE_UNAVAILABLE');
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
              { role: 'system', content: INDEX_ADVISOR_SYSTEM_PROMPT },
              { role: 'user', content: buildIndexAdvisorUserPrompt(request) },
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
        { scope: 'IndexAdvisor' },
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
      return c.json(
        withMeta(c, {
          summary: result.summary,
          recommendations: result.recommendations,
        }),
      );
    } catch (error) {
      if (reservation) {
        try {
          await failAIUsage(c.env, reservation, 'UPSTREAM_OPENAI_ERROR');
        } catch (refundError) {
          console.error(
            '[index-advisor] failed to refund credits after upstream error',
            refundError,
          );
        }
      }
      console.error('[index-advisor] failed', error);
      audit(502, false, false, 'UPSTREAM_OPENAI_ERROR');
      return errorResponse(c, 502, 'Upstream OpenAI error', 'UPSTREAM_OPENAI_ERROR');
    }
  });
}
