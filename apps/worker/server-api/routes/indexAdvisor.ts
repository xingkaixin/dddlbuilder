import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { rejectAIRequest, withAIGovernance, type AIChatMessage } from '../lib/aiRoute.js';
import { withMeta } from '../lib/http.js';
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

const normalizeRecommendedIndex = (
  value: unknown,
  fieldNames: ReadonlySet<string>,
): AIIndexAdvisorIndexInput | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const index = value as Record<string, unknown>;
  const name = typeof index.name === 'string' ? index.name.trim() : '';
  if (!name || !Array.isArray(index.fields) || index.fields.length === 0) return undefined;

  const fields: AIIndexAdvisorIndexInput['fields'] = [];
  for (const rawField of index.fields) {
    if (!rawField || typeof rawField !== 'object') return undefined;
    const field = rawField as Record<string, unknown>;
    const fieldName = typeof field.name === 'string' ? field.name.trim() : '';
    if (!fieldNames.has(fieldName)) return undefined;
    fields.push({
      name: fieldName,
      direction: field.direction === 'DESC' ? 'DESC' : 'ASC',
    });
  }
  return { name, fields, unique: index.unique === true };
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

      const recommendedIndex = normalizeRecommendedIndex(raw.index, fieldNames);

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

const buildMessages = (request: AIIndexAdvisorRequest): AIChatMessage[] => [
  { role: 'system', content: INDEX_ADVISOR_SYSTEM_PROMPT },
  { role: 'user', content: buildIndexAdvisorUserPrompt(request) },
];

export function registerIndexAdvisorRoute(app: Hono<ApiEnv>) {
  app.post('/index-advisor', (c) =>
    withAIGovernance<AIIndexAdvisorRequest>(
      c,
      {
        route: 'index-advisor',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        bodyMaxBytes: MAX_REQUEST_BYTES,
        buildMessages,
        parseRequest: (body) => {
          const fields = normalizeFields(body.fields);
          const tableName = typeof body.tableName === 'string' ? body.tableName.trim() : '';
          const queryPatterns =
            typeof body.queryPatterns === 'string' ? body.queryPatterns.trim() : '';
          if (!tableName || fields.length === 0) {
            return rejectAIRequest('SCHEMA_REQUIRED', 'Table schema is required');
          }
          if (!queryPatterns || queryPatterns.length > MAX_QUERY_PATTERNS_LENGTH) {
            return rejectAIRequest('SQL_REQUIRED', 'Query patterns are required');
          }
          return {
            dbType: typeof body.dbType === 'string' ? body.dbType.trim() : 'mysql',
            schemaName: typeof body.schemaName === 'string' ? body.schemaName.trim() : undefined,
            tableName,
            tableComment: typeof body.tableComment === 'string' ? body.tableComment.trim() : '',
            fields,
            indexes: normalizeIndexes(body.indexes),
            queryPatterns,
          };
        },
      },
      async (session) => {
        const data = await session.completeJson({
          scope: 'IndexAdvisor',
          temperature: 0.2,
        });
        const result = normalizeResult(data, session.request.fields);
        return c.json(
          withMeta(c, { summary: result.summary, recommendations: result.recommendations }),
        );
      },
    ),
  );
}
