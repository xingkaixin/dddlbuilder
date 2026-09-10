import { AIIndexAdvisorProviderResultSchema } from '@ddlbuilder/shared-types/ai-generate';
import { decodeAIRequest } from '../lib/aiRequest.js';
import {
  AIIndexAdvisorRequestSchema,
  decodeAIIndexAdvisorProviderResult,
  type AIIndexAdvisorRequest,
} from '@ddlbuilder/shared-types/ai-generate';
import * as Effect from 'effect/Effect';
import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { withAIGovernance, type AIChatMessage } from '../lib/aiRoute.js';
import { withMeta } from '../lib/http.js';
import {
  INDEX_ADVISOR_SYSTEM_PROMPT,
  buildIndexAdvisorUserPrompt,
} from '../prompts/indexAdvisor.js';
import type {
  AIIndexAdvisorFieldInput,
  AIIndexAdvisorResult,
} from '@ddlbuilder/shared-types/ai-generate';

const MAX_OUTPUT_TOKENS = 2200;
const MAX_REQUEST_BYTES = 64_000;

const normalizeResult = (
  payload: unknown,
  fields: AIIndexAdvisorFieldInput[],
): AIIndexAdvisorResult => {
  const result = decodeAIIndexAdvisorProviderResult(payload);
  const fieldNames = new Set(fields.map((field) => field.fieldName));

  return {
    ...result,
    recommendations: result.recommendations.map((recommendation) => {
      if (
        !recommendation.index ||
        recommendation.index.fields.every((field) => fieldNames.has(field.name))
      )
        return recommendation;
      const { index: _index, ...rest } = recommendation;

      return rest;
    }),
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
        outputSchema: AIIndexAdvisorProviderResultSchema,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        bodyMaxBytes: MAX_REQUEST_BYTES,
        buildMessages,
        parseRequest: decodeAIRequest(
          AIIndexAdvisorRequestSchema,
          {
            dbType: { code: 'INVALID_DATABASE_TYPE', message: 'Invalid database type' },
            queryPatterns: { code: 'SQL_REQUIRED', message: 'Query patterns are required' },
          },
          { code: 'SCHEMA_REQUIRED', message: 'Table schema is required' },
        ),
      },
      (session) =>
        Effect.gen(function* () {
          const data = yield* session.completeJson({
            scope: 'IndexAdvisor',
            temperature: 0.2,
          });
          const result = normalizeResult(data, session.request.fields);

          return c.json(
            withMeta(c, { summary: result.summary, recommendations: result.recommendations }),
          );
        }),
    ),
  );
}
