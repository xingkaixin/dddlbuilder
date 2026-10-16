import { DDLReviewSuggestionSchema } from './ddlReview.js';
import * as Schema from 'effect/Schema';

export const AIConversationRouteSchema = Schema.Literals([
  'explain',
  'review',
  'generate-table',
  'generate-comments',
  'index-advisor',
]);
export const AI_CONTEXT_LIMIT_ERROR = 'AI conversation context limit reached';

export const AIOperationIdentitySchema = Schema.Struct({
  operationId: Schema.String,
  conversationId: Schema.String,
  userId: Schema.String,
});
export const AIConversationSnapshotSchema = Schema.Struct({
  operationId: Schema.String,
  conversationId: Schema.String,
  status: Schema.Literals(['running', 'succeeded', 'failed', 'cancelled']),
  text: Schema.String,
  thinking: Schema.String,
  result: Schema.Unknown,
  suggestions: Schema.Array(DDLReviewSuggestionSchema),
  error: Schema.NullOr(Schema.String),
  accountingPending: Schema.Boolean,
});

export type AIConversationSnapshot = typeof AIConversationSnapshotSchema.Type;

export type AIConversationRoute = typeof AIConversationRouteSchema.Type;

export const decodeAIConversationSnapshot = Schema.decodeUnknownSync(AIConversationSnapshotSchema);
