import {
  AIReviewProviderSchema,
  AICommentProviderSchema,
  AIIndexProviderSchema,
} from './aiProviderContracts.js';
import * as Schema from 'effect/Schema';
import {
  AIExplainRequestSchema,
  AIReviewRequestSchema,
  AIGenerateTableRequestSchema,
  AICommentRequestSchema,
  AIIndexAdvisorRequestSchema,
  GeneratedTableProviderSchema,
  AICommentResultSchema,
  AIIndexAdvisorProviderResultSchema,
} from '@ddlbuilder/shared-types/ai-generate';
import {
  type DDLReviewResultSchema,
  ddlReviewProviderSchema,
} from '@ddlbuilder/shared-types/ddl-review';
import { EXPLAIN_SYSTEM_PROMPT, buildExplainUserPrompt } from '../prompts/explain.js';
import { REVIEW_SYSTEM_PROMPT, buildReviewUserPrompt } from '../prompts/review.js';
import {
  buildGenerateTableMessages,
  buildGenerateTableSystemPrompt,
} from '../prompts/generateTable.js';
import {
  GENERATE_COMMENTS_SYSTEM_PROMPT,
  buildGenerateCommentsUserPrompt,
} from '../prompts/generateComments.js';
import {
  INDEX_ADVISOR_SYSTEM_PROMPT,
  buildIndexAdvisorUserPrompt,
} from '../prompts/indexAdvisor.js';
import type { AIRouteKey } from './aiRouteKey.js';

export type AIScenario = {
  instructions: string;
  input: string;
  maxTokens: number;
  outputSchema?: Schema.Constraint;
  decode: (
    text: string,
  ) =>
    | string
    | typeof DDLReviewResultSchema.Type
    | typeof GeneratedTableProviderSchema.Type
    | typeof AICommentResultSchema.Type
    | typeof AIIndexAdvisorProviderResultSchema.Type;
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- scenario requests are decoded at the HTTP and persisted-operation boundaries.
export const prepareAIScenario = (route: AIRouteKey, body: unknown): AIScenario => {
  switch (route) {
    case 'explain': {
      const request = Schema.decodeUnknownSync(AIExplainRequestSchema)(body);

      return {
        instructions: EXPLAIN_SYSTEM_PROMPT[request.locale],
        input: buildExplainUserPrompt(request.sql, request.context, request.locale),
        maxTokens: 1000,
        decode: (text) => {
          if (!text.trim()) throw new Error('Empty model output');

          return text;
        },
      };
    }

    case 'review': {
      const request = Schema.decodeUnknownSync(AIReviewRequestSchema)(body);

      return {
        instructions: REVIEW_SYSTEM_PROMPT[request.locale],
        input: buildReviewUserPrompt(
          request.ddl,
          request.tableName,
          request.dbType,
          request.locale,
        ),
        maxTokens: 4000,
        outputSchema: AIReviewProviderSchema,
        decode: (text) => Schema.decodeUnknownSync(ddlReviewProviderSchema(''))(JSON.parse(text)),
      };
    }

    case 'generate-table': {
      const request = Schema.decodeUnknownSync(AIGenerateTableRequestSchema)(body);
      const instructions = buildGenerateTableSystemPrompt(request);

      const messages = buildGenerateTableMessages({
        systemPrompt: instructions,
        description: request.description,
        conversationHistory: request.conversationHistory,
      });

      return {
        instructions,
        input: messages
          .filter((message) => message.role !== 'system')
          .map((message) => `${message.role}: ${message.content}`)
          .join('\n'),
        maxTokens: 6000,
        outputSchema: GeneratedTableProviderSchema,
        decode: (text) => Schema.decodeUnknownSync(GeneratedTableProviderSchema)(JSON.parse(text)),
      };
    }

    case 'generate-comments': {
      const request = Schema.decodeUnknownSync(AICommentRequestSchema)(body);

      return {
        instructions: GENERATE_COMMENTS_SYSTEM_PROMPT,
        input: buildGenerateCommentsUserPrompt(request),
        maxTokens: 1800,
        outputSchema: AICommentProviderSchema,
        decode: (text) => {
          const result = Schema.decodeUnknownSync(AICommentResultSchema)(JSON.parse(text));

          const fields = new Map(
            result.fields.map((field) => [field.fieldName, field.fieldComment]),
          );

          return {
            tableComment: result.tableComment,
            fields: request.fields.map((field) => ({
              fieldName: field.fieldName,
              fieldComment: fields.get(field.fieldName) ?? '',
            })),
          };
        },
      };
    }

    case 'index-advisor': {
      const request = Schema.decodeUnknownSync(AIIndexAdvisorRequestSchema)(body);

      return {
        instructions: INDEX_ADVISOR_SYSTEM_PROMPT,
        input: buildIndexAdvisorUserPrompt(request),
        maxTokens: 2200,
        outputSchema: AIIndexProviderSchema,
        decode: (text) => {
          const result = Schema.decodeUnknownSync(AIIndexAdvisorProviderResultSchema)(
            JSON.parse(text),
          );
          const names = new Set(request.fields.map((field) => field.fieldName));

          return {
            ...result,
            recommendations: result.recommendations.map((item) => {
              if (!item.index || item.index.fields.every((field) => names.has(field.name)))
                return item;
              const { index: _index, ...rest } = item;

              return rest;
            }),
          };
        },
      };
    }
  }
};
