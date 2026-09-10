import { AICommentResultSchema } from '@ddlbuilder/shared-types/ai-generate';
import { decodeAIRequest } from '../lib/aiRequest.js';
import {
  AICommentRequestSchema,
  decodeAICommentResult,
  type AICommentRequest,
} from '@ddlbuilder/shared-types/ai-generate';
import * as Effect from 'effect/Effect';
import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { withAIGovernance, type AIChatMessage } from '../lib/aiRoute.js';
import { withMeta } from '../lib/http.js';
import {
  GENERATE_COMMENTS_SYSTEM_PROMPT,
  buildGenerateCommentsUserPrompt,
} from '../prompts/generateComments.js';
import type { AICommentFieldInput, AICommentResult } from '@ddlbuilder/shared-types/ai-generate';

const REQUEST_BODY_MAX_BYTES = 1024 * 1024;

const MAX_OUTPUT_TOKENS = 1800;

const normalizeResult = (payload: unknown, fields: AICommentFieldInput[]): AICommentResult => {
  const data = decodeAICommentResult(payload);
  const byName = new Map(data.fields.map((field) => [field.fieldName, field.fieldComment]));

  return {
    tableComment: data.tableComment,
    fields: fields.map((field) => ({
      fieldName: field.fieldName,
      fieldComment: byName.get(field.fieldName) ?? '',
    })),
  };
};

const buildMessages = (request: AICommentRequest): AIChatMessage[] => [
  { role: 'system', content: GENERATE_COMMENTS_SYSTEM_PROMPT },
  { role: 'user', content: buildGenerateCommentsUserPrompt(request) },
];

export function registerGenerateCommentsRoute(app: Hono<ApiEnv>) {
  app.post('/generate-comments', (c) =>
    withAIGovernance<AICommentRequest>(
      c,
      {
        route: 'generate-comments',
        outputSchema: AICommentResultSchema,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        bodyMaxBytes: REQUEST_BODY_MAX_BYTES,
        buildMessages,
        parseRequest: decodeAIRequest(
          AICommentRequestSchema,
          {},
          { code: 'SCHEMA_REQUIRED', message: 'Table schema is required' },
        ),
      },
      (session) =>
        Effect.gen(function* () {
          const data = yield* session.completeJson({
            scope: 'GenerateComments',
            temperature: 0.2,
          });
          const result = normalizeResult(data, session.request.fields);

          return c.json(withMeta(c, result));
        }),
    ),
  );
}
