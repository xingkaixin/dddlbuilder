import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { rejectAIRequest, withAIGovernance } from '../lib/aiRoute.js';
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

export function registerGenerateTableRoute(app: Hono<ApiEnv>) {
  app.post('/generate-table', (c) =>
    withAIGovernance<GenerateTableRequest>(
      c,
      {
        route: 'generate-table',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        bodyMaxBytes: REQUEST_BODY_MAX_BYTES,
        parseRequest: (body) => {
          const description = typeof body.description === 'string' ? body.description : '';
          if (description.trim().length === 0) {
            return rejectAIRequest('DESCRIPTION_REQUIRED', 'Description is required');
          }
          return {
            description,
            dbType: typeof body.dbType === 'string' ? body.dbType : '',
            locale: isAppLocale(body.locale) ? body.locale : 'zh-CN',
            mode: body.mode === 'patch' ? 'patch' : 'generate',
            templates: Array.isArray(body.templates) ? body.templates : [],
            existingConfig: body.existingConfig,
            previousSchema: body.previousSchema,
            // 与改造前一致：只确认是数组，元素形状留给 prompt 构造处理
            conversationHistory: (Array.isArray(body.conversationHistory)
              ? body.conversationHistory
              : []) as ConversationMessage[],
          };
        },
      },
      async (session) => {
        const {
          description,
          dbType,
          locale,
          mode,
          templates,
          existingConfig,
          previousSchema,
          conversationHistory,
        } = session.request;

        return session.streamCompletion({
          messages: buildGenerateTableMessages({
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
          }),
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
            conversationTurnCount: conversationHistory.length,
          },
        });
      },
    ),
  );
}
