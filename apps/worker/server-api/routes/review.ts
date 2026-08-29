import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { rejectAIRequest, withAIGovernance, type AIChatMessage } from '../lib/aiRoute.js';
import { REVIEW_SYSTEM_PROMPT, buildReviewUserPrompt } from '../prompts/review.js';
import { isAppLocale, type AppLocale } from '@ddlbuilder/shared-types/locale';
import { isDatabaseType, type DatabaseType } from '@ddlbuilder/shared-types';

const MAX_OUTPUT_TOKENS = 2000;
const REQUEST_BODY_MAX_BYTES = 512 * 1024;

type ReviewRequest = {
  ddl: string;
  tableName: string;
  dbType: DatabaseType;
  locale: AppLocale;
};

const buildMessages = ({ ddl, tableName, dbType, locale }: ReviewRequest): AIChatMessage[] => [
  { role: 'system', content: REVIEW_SYSTEM_PROMPT[locale] },
  { role: 'user', content: buildReviewUserPrompt(ddl, tableName, dbType, locale) },
];

export function registerReviewRoute(app: Hono<ApiEnv>) {
  app.post('/review', (c) =>
    withAIGovernance<ReviewRequest>(
      c,
      {
        route: 'review',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        bodyMaxBytes: REQUEST_BODY_MAX_BYTES,
        buildMessages,
        parseRequest: (body) => {
          if (!isDatabaseType(body.dbType)) {
            return rejectAIRequest('INVALID_DATABASE_TYPE', 'Invalid database type');
          }
          const ddl = typeof body.ddl === 'string' ? body.ddl : '';
          if (ddl.trim().length === 0) {
            return rejectAIRequest('DDL_REQUIRED', 'DDL is required');
          }
          return {
            ddl,
            tableName: typeof body.tableName === 'string' ? body.tableName : '',
            dbType: body.dbType,
            locale: isAppLocale(body.locale) ? body.locale : 'zh-CN',
          };
        },
      },
      async (session) => {
        const { ddl, tableName, dbType, locale } = session.request;
        return session.streamCompletion({
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
      },
    ),
  );
}
