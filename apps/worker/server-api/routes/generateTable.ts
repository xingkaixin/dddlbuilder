import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { rejectAIRequest, withAIGovernance, type AIChatMessage } from '../lib/aiRoute.js';
import {
  buildGenerateTableMessages,
  buildGenerateTableSystemPrompt,
} from '../prompts/generateTable.js';
import { isAppLocale, type AppLocale } from '@ddlbuilder/shared-types/locale';
import type { ConversationMessage } from '@ddlbuilder/shared-types/ai-generate';

const MAX_OUTPUT_TOKENS = 4000;
const REQUEST_BODY_MAX_BYTES = 1024 * 1024;

type GenerateTableRequest = {
  description: string;
  dbType: string;
  locale: AppLocale;
  mode: 'generate' | 'patch';
  templates: unknown[];
  existingConfig: unknown;
  previousSchema: unknown;
  conversationHistory: ConversationMessage[];
};

const parseConversationHistory = (value: unknown): ConversationMessage[] | null => {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const messages: ConversationMessage[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      return null;
    }
    const { role, content } = item as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
      return null;
    }
    messages.push({ role, content });
  }
  return messages;
};

const buildMessages = ({
  description,
  dbType,
  locale,
  mode,
  templates,
  existingConfig,
  previousSchema,
  conversationHistory,
}: GenerateTableRequest): AIChatMessage[] =>
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
    withAIGovernance<GenerateTableRequest>(
      c,
      {
        route: 'generate-table',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        bodyMaxBytes: REQUEST_BODY_MAX_BYTES,
        buildMessages,
        parseRequest: (body) => {
          const description = typeof body.description === 'string' ? body.description : '';
          if (description.trim().length === 0) {
            return rejectAIRequest('DESCRIPTION_REQUIRED', 'Description is required');
          }
          const conversationHistory = parseConversationHistory(body.conversationHistory);
          if (conversationHistory === null) {
            return rejectAIRequest('INVALID_JSON', 'Invalid conversation history');
          }
          return {
            description,
            dbType: typeof body.dbType === 'string' ? body.dbType : '',
            locale: isAppLocale(body.locale) ? body.locale : 'zh-CN',
            mode: body.mode === 'patch' ? 'patch' : 'generate',
            templates: Array.isArray(body.templates) ? body.templates : [],
            existingConfig: body.existingConfig,
            previousSchema: body.previousSchema,
            conversationHistory,
          };
        },
      },
      async (session) => {
        const { description, dbType, locale, mode, templates, existingConfig, previousSchema } =
          session.request;

        return session.streamCompletion({
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
      },
    ),
  );
}
