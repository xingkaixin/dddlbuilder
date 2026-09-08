import { decodeAIRequest } from '../lib/aiRequest.js';
import { AIReviewRequestSchema, type AIReviewRequest } from '@ddlbuilder/shared-types/ai-generate';
import * as Effect from 'effect/Effect';
import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { withAIGovernance, type AIChatMessage } from '../lib/aiRoute.js';
import { REVIEW_SYSTEM_PROMPT, buildReviewUserPrompt } from '../prompts/review.js';

const MAX_OUTPUT_TOKENS = 2000;
const REQUEST_BODY_MAX_BYTES = 512 * 1024;

const buildMessages = ({ ddl, tableName, dbType, locale }: AIReviewRequest): AIChatMessage[] => [
  { role: 'system', content: REVIEW_SYSTEM_PROMPT[locale] },
  { role: 'user', content: buildReviewUserPrompt(ddl, tableName, dbType, locale) },
];

export function registerReviewRoute(app: Hono<ApiEnv>) {
  app.post('/review', (c) =>
    withAIGovernance<AIReviewRequest>(
      c,
      {
        route: 'review',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        bodyMaxBytes: REQUEST_BODY_MAX_BYTES,
        buildMessages,
        parseRequest: decodeAIRequest(
          AIReviewRequestSchema,
          {
            dbType: { code: 'INVALID_DATABASE_TYPE', message: 'Invalid database type' },
            ddl: { code: 'DDL_REQUIRED', message: 'DDL is required' },
          },
          { code: 'INVALID_DATABASE_TYPE', message: 'Invalid database type' },
        ),
      },
      (session) =>
        Effect.gen(function* () {
          const { ddl, tableName, dbType, locale } = session.request;
          return yield* session.streamCompletion({
            scope: 'Review',
            temperature: 0.3,
            jsonResponse: true,
            debugInput: {
              ddlLength: ddl.length,
              tableNameLength: tableName.length,
              dbType,
              locale,
            },
          });
        }),
    ),
  );
}
