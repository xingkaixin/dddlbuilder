import type { Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { rejectAIRequest, withAIGovernance } from '../lib/aiRoute.js';
import { withMeta } from '../lib/http.js';
import {
  GENERATE_COMMENTS_SYSTEM_PROMPT,
  buildGenerateCommentsUserPrompt,
} from '../prompts/generateComments.js';
import { isAppLocale, type AppLocale } from '@ddlbuilder/shared-types/locale';
import type {
  AICommentFieldInput,
  AICommentRequest,
  AICommentResult,
} from '@ddlbuilder/shared-types/ai-generate';

const REQUEST_BODY_MAX_BYTES = 1024 * 1024;

const MAX_OUTPUT_TOKENS = 1800;

const isCommentMode = (value: unknown): value is AICommentRequest['mode'] =>
  value === 'fill_missing' || value === 'translate';

const normalizeFields = (value: unknown): AICommentFieldInput[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const field = item as Record<string, unknown>;
      const fieldName = typeof field.fieldName === 'string' ? field.fieldName.trim() : '';
      const fieldType = typeof field.fieldType === 'string' ? field.fieldType.trim() : '';
      const fieldComment = typeof field.fieldComment === 'string' ? field.fieldComment.trim() : '';
      if (!fieldName) return null;
      return { fieldName, fieldType, fieldComment };
    })
    .filter((item): item is AICommentFieldInput => item !== null);
};

const normalizeResult = (payload: unknown, fields: AICommentFieldInput[]): AICommentResult => {
  const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const resultFields = Array.isArray(data.fields) ? data.fields : [];
  const byName = new Map<string, string>();

  resultFields.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const field = item as Record<string, unknown>;
    if (typeof field.fieldName !== 'string' || typeof field.fieldComment !== 'string') return;
    byName.set(field.fieldName, field.fieldComment.trim());
  });

  return {
    tableComment: typeof data.tableComment === 'string' ? data.tableComment.trim() : '',
    fields: fields.map((field) => ({
      fieldName: field.fieldName,
      fieldComment: byName.get(field.fieldName) ?? '',
    })),
  };
};

export function registerGenerateCommentsRoute(app: Hono<ApiEnv>) {
  app.post('/generate-comments', (c) =>
    withAIGovernance<AICommentRequest>(
      c,
      {
        route: 'generate-comments',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        bodyMaxBytes: REQUEST_BODY_MAX_BYTES,
        parseRequest: (body) => {
          const fields = normalizeFields(body.fields);
          const tableName = typeof body.tableName === 'string' ? body.tableName.trim() : '';
          if (!tableName || fields.length === 0) {
            return rejectAIRequest('SCHEMA_REQUIRED', 'Table schema is required');
          }
          return {
            mode: isCommentMode(body.mode) ? body.mode : 'fill_missing',
            targetLocale: isAppLocale(body.targetLocale)
              ? (body.targetLocale as AppLocale)
              : 'zh-CN',
            schemaName: typeof body.schemaName === 'string' ? body.schemaName.trim() : undefined,
            tableName,
            tableComment: typeof body.tableComment === 'string' ? body.tableComment.trim() : '',
            fields,
          };
        },
      },
      async (session) => {
        const data = await session.completeJson({
          system: GENERATE_COMMENTS_SYSTEM_PROMPT,
          user: buildGenerateCommentsUserPrompt(session.request),
          scope: 'GenerateComments',
          temperature: 0.2,
        });
        const result = normalizeResult(data, session.request.fields);
        return c.json(withMeta(c, result));
      },
    ),
  );
}
