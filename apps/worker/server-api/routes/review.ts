import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { rejectAIRequest, withAIGovernance } from '../lib/aiRoute.js';
import { REVIEW_SYSTEM_PROMPT, buildReviewUserPrompt } from '../prompts/review.js';
import { isAppLocale, type AppLocale } from '@ddlbuilder/shared-types/locale';

const MAX_OUTPUT_TOKENS = 2000;
const REQUEST_BODY_MAX_BYTES = 512 * 1024;

type ReviewRequest = {
  ddl: string;
  tableName: string;
  dbType: string;
  locale: AppLocale;
};

export function registerReviewRoute(app: Hono<ApiEnv>) {
  app.post('/review', (c) =>
    withAIGovernance<ReviewRequest>(
      c,
      {
        route: 'review',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        bodyMaxBytes: REQUEST_BODY_MAX_BYTES,
        parseRequest: (body) => {
          const ddl = typeof body.ddl === 'string' ? body.ddl : '';
          if (ddl.trim().length === 0) {
            return rejectAIRequest('DDL_REQUIRED', 'DDL is required');
          }
          return {
            ddl,
            tableName: typeof body.tableName === 'string' ? body.tableName : '',
            dbType: typeof body.dbType === 'string' ? body.dbType : '',
            locale: isAppLocale(body.locale) ? body.locale : 'zh-CN',
          };
        },
      },
      async (session) => {
        const { ddl, tableName, dbType, locale } = session.request;
        return session.streamCompletion({
          messages: [
            { role: 'system', content: REVIEW_SYSTEM_PROMPT[locale] },
            { role: 'user', content: buildReviewUserPrompt(ddl, tableName, dbType, locale) },
          ],
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
