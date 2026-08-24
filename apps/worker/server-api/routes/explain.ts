import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { rejectAIRequest, withAIGovernance, type AIChatMessage } from '../lib/aiRoute.js';
import { EXPLAIN_SYSTEM_PROMPT, buildExplainUserPrompt } from '../prompts/explain.js';
import { isAppLocale, type AppLocale } from '@ddlbuilder/shared-types/locale';

const MAX_OUTPUT_TOKENS = 1000;
const REQUEST_BODY_MAX_BYTES = 256 * 1024;

type ExplainRequest = {
  sql: string;
  context: string;
  locale: AppLocale;
};

const buildMessages = ({ sql, context, locale }: ExplainRequest): AIChatMessage[] => [
  { role: 'system', content: EXPLAIN_SYSTEM_PROMPT[locale] },
  { role: 'user', content: buildExplainUserPrompt(sql, context, locale) },
];

export function registerExplainRoute(app: Hono<ApiEnv>) {
  app.post('/explain', (c) =>
    withAIGovernance<ExplainRequest>(
      c,
      {
        route: 'explain',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        bodyMaxBytes: REQUEST_BODY_MAX_BYTES,
        buildMessages,
        parseRequest: (body) => {
          const sql = typeof body.sql === 'string' ? body.sql : '';
          if (sql.trim().length === 0) {
            return rejectAIRequest('SQL_REQUIRED', 'SQL is required');
          }
          return {
            sql,
            context: typeof body.context === 'string' ? body.context : '',
            locale: isAppLocale(body.locale) ? body.locale : 'zh-CN',
          };
        },
      },
      async (session) => {
        const { sql, context, locale } = session.request;
        return session.streamCompletion({
          scope: 'Explain',
          temperature: 0.3,
          debugInput: { sqlLength: sql.length, contextLength: context.length, locale },
        });
      },
    ),
  );
}
