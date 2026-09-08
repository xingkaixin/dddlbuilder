import { decodeAIRequest } from '../lib/aiRequest.js';
import {
  AIGenerateTableRequestSchema,
  type AIGenerateTableRequest,
} from '@ddlbuilder/shared-types/ai-generate';
import * as Effect from 'effect/Effect';
import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { withAIGovernance, type AIChatMessage } from '../lib/aiRoute.js';
import {
  buildGenerateTableMessages,
  buildGenerateTableSystemPrompt,
} from '../prompts/generateTable.js';

const MAX_OUTPUT_TOKENS = 4000;
const REQUEST_BODY_MAX_BYTES = 1024 * 1024;

const buildMessages = ({
  description,
  dbType,
  locale,
  mode,
  templates,
  existingConfig,
  previousSchema,
  conversationHistory,
}: AIGenerateTableRequest): AIChatMessage[] =>
  buildGenerateTableMessages({
    systemPrompt: buildGenerateTableSystemPrompt({
      dbType,
      locale,
      mode,
      templates,
      existingConfig,
      previousSchema,
    }),
    description,
    conversationHistory,
  });

export function registerGenerateTableRoute(app: Hono<ApiEnv>) {
  app.post('/generate-table', (c) =>
    withAIGovernance<AIGenerateTableRequest>(
      c,
      {
        route: 'generate-table',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        bodyMaxBytes: REQUEST_BODY_MAX_BYTES,
        buildMessages,
        parseRequest: decodeAIRequest(
          AIGenerateTableRequestSchema,
          {
            dbType: { code: 'INVALID_DATABASE_TYPE', message: 'Invalid database type' },
            description: { code: 'DESCRIPTION_REQUIRED', message: 'Description is required' },
            conversationHistory: { code: 'INVALID_JSON', message: 'Invalid conversation history' },
          },
          { code: 'INVALID_DATABASE_TYPE', message: 'Invalid database type' },
        ),
      },
      (session) =>
        Effect.gen(function* () {
          const { description, dbType, locale, mode, templates, existingConfig, previousSchema } =
            session.request;

          return yield* session.streamCompletion({
            scope: 'GenerateTable',
            temperature: 0.3,
            jsonResponse: true,
            debugInput: {
              descriptionLength: description.length,
              dbType,
              locale,
              mode,
              templateCount: templates.length,
              hasExistingConfig: existingConfig != null,
              hasPreviousSchema: previousSchema != null,
              conversationTurnCount: session.request.conversationHistory.length,
            },
          });
        }),
    ),
  );
}
