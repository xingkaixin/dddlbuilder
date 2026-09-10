import { decodeAIRequest } from '../lib/aiRequest.js';
import {
  AIExplainRequestSchema,
  type AIExplainRequest,
} from '@ddlbuilder/shared-types/ai-generate';
import * as Effect from 'effect/Effect';
import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { withAIGovernance, type AIChatMessage } from '../lib/aiRoute.js';
import { EXPLAIN_SYSTEM_PROMPT, buildExplainUserPrompt } from '../prompts/explain.js';

const MAX_OUTPUT_TOKENS = 1000;
const REQUEST_BODY_MAX_BYTES = 256 * 1024;

const buildMessages = ({ sql, context, locale }: AIExplainRequest): AIChatMessage[] => [
  { role: 'system', content: EXPLAIN_SYSTEM_PROMPT[locale] },
  { role: 'user', content: buildExplainUserPrompt(sql, context, locale) },
];

export function registerExplainRoute(app: Hono<ApiEnv>) {
  app.post('/explain', (c) =>
    withAIGovernance<AIExplainRequest>(
      c,
      {
        route: 'explain',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        bodyMaxBytes: REQUEST_BODY_MAX_BYTES,
        buildMessages,
        parseRequest: decodeAIRequest(
          AIExplainRequestSchema,
          { sql: { code: 'SQL_REQUIRED', message: 'SQL is required' } },
          { code: 'SQL_REQUIRED', message: 'SQL is required' },
        ),
      },
      (session) =>
        Effect.gen(function* () {
          const { sql, context, locale } = session.request;

          return yield* session.streamCompletion({
            scope: 'Explain',
            temperature: 0.3,
            debugInput: { sqlLength: sql.length, contextLength: context.length, locale },
          });
        }),
    ),
  );
}
