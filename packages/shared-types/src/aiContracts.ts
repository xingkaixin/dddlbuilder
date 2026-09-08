import { pipe } from 'effect/Function';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import * as SchemaGetter from 'effect/SchemaGetter';
import { APP_LOCALES } from './locale.js';
import { DATABASE_TYPES } from './database.js';

const defaulted = <S extends Schema.Constraint>(schema: S, fallback: () => S['Type']) => {
  const recovered = Schema.catchDecoding<S>(() => Effect.sync(() => Option.some(fallback())))(
    schema,
  );
  return Schema.withDecodingDefaultType<typeof recovered>(Effect.sync(fallback))(recovered);
};

const optionalDecoded = <S extends Schema.Constraint>(schema: S) =>
  pipe(
    schema,
    Schema.catchDecoding<S>(() => Effect.succeed(Option.none())),
    Schema.optional,
  );

const validItems = <S extends Schema.ConstraintDecoder<unknown>>(
  item: S,
  map: (value: S['Type'], index: number) => S['Type'] = (value) => value,
) => {
  const decode = Schema.decodeUnknownResult(item);
  return defaulted(Schema.Array(Schema.Unknown), () => []).pipe(
    Schema.decodeTo(Schema.Array(Schema.toType(item)).pipe(Schema.mutable), {
      decode: SchemaGetter.transform((items) =>
        items.flatMap((value, index) => {
          const result = decode(value);
          return Result.isSuccess(result) ? [map(result.success, index)] : [];
        }),
      ),
      encode: SchemaGetter.transform((items) => items),
    }),
  );
};

const text = defaulted(Schema.String, () => '');
const trimmedText = defaulted(Schema.Trim, () => '');
const name = Schema.Trim.check(Schema.isNonEmpty());
const requiredText = Schema.String.check(Schema.makeFilter((value) => value.trim().length > 0));
const flag = defaulted(Schema.Boolean, () => false);
const locale = defaulted(Schema.Literals(APP_LOCALES), () => 'zh-CN' as const);
const database = Schema.Literals(DATABASE_TYPES);
const direction = defaulted(Schema.Literals(['ASC', 'DESC']), () => 'ASC' as const);

export const ConversationMessageSchema = Schema.Struct({
  role: Schema.Literals(['user', 'assistant']),
  content: Schema.String,
});

const conversationHistory = Schema.NullOr(
  Schema.Array(ConversationMessageSchema).pipe(Schema.mutable),
).pipe(
  Schema.decodeTo(Schema.Array(ConversationMessageSchema).pipe(Schema.mutable), {
    decode: SchemaGetter.transform((messages) => messages ?? []),
    encode: SchemaGetter.transform((messages) => messages),
  }),
  Schema.withDecodingDefaultType(Effect.succeed([])),
);

export const AIExplainRequestSchema = Schema.Struct({ sql: requiredText, context: text, locale });
export type AIExplainRequest = typeof AIExplainRequestSchema.Type;

export const AIReviewRequestSchema = Schema.Struct({
  dbType: database,
  ddl: requiredText,
  tableName: text,
  locale,
});
export type AIReviewRequest = typeof AIReviewRequestSchema.Type;

export const AIGenerateTableRequestSchema = Schema.Struct({
  dbType: database,
  description: requiredText,
  conversationHistory,
  locale,
  mode: defaulted(Schema.Literals(['generate', 'patch']), () => 'generate' as const),
  templates: defaulted(Schema.Array(Schema.Unknown).pipe(Schema.mutable), () => []),
  existingConfig: Schema.optional(Schema.Unknown),
  previousSchema: Schema.optional(Schema.Unknown),
});
export type AIGenerateTableRequest = typeof AIGenerateTableRequestSchema.Type;

export const AICommentFieldInputSchema = Schema.Struct({
  fieldName: name,
  fieldType: trimmedText,
  fieldComment: trimmedText,
});
export const AICommentModeSchema = Schema.Literals(['fill_missing', 'translate']);
export const AICommentRequestSchema = Schema.Struct({
  tableName: name,
  fields: validItems(AICommentFieldInputSchema).check(Schema.isNonEmpty()),
  mode: defaulted(AICommentModeSchema, () => 'fill_missing' as const),
  targetLocale: locale,
  schemaName: optionalDecoded(Schema.Trim),
  tableComment: trimmedText,
});
export const AICommentFieldResultSchema = Schema.Struct({
  fieldName: Schema.String,
  fieldComment: Schema.Trim,
});
export const AICommentResultSchema = Schema.Struct({
  tableComment: trimmedText,
  fields: validItems(AICommentFieldResultSchema),
});

export const AIIndexAdvisorFieldInputSchema = Schema.Struct({
  ...AICommentFieldInputSchema.fields,
  nullable: flag,
});
const indexField = Schema.Struct({ name, direction });
export const AIIndexAdvisorIndexInputSchema = Schema.Struct({
  name,
  fields: validItems(indexField).check(Schema.isNonEmpty()),
  unique: flag,
  isPrimary: Schema.optional(flag),
});
const requestIndex = Schema.Struct({
  ...AIIndexAdvisorIndexInputSchema.fields,
  isPrimary: flag,
}).pipe(Schema.decodeTo(Schema.toType(AIIndexAdvisorIndexInputSchema)));
export const AIIndexAdvisorRequestSchema = Schema.Struct({
  dbType: database,
  tableName: name,
  fields: validItems(AIIndexAdvisorFieldInputSchema).check(Schema.isNonEmpty()),
  queryPatterns: name.check(Schema.isMaxLength(20_000)),
  schemaName: optionalDecoded(Schema.Trim),
  tableComment: trimmedText,
  indexes: validItems(requestIndex),
});

export const AIIndexAdvisorRecommendationCategorySchema = Schema.Literals([
  'missing_index',
  'redundant_index',
  'order_optimization',
  'query_rewrite',
  'general',
]);
const recommendedIndex = Schema.Struct({
  name,
  // A partially decoded index can change uniqueness semantics; reject it as a whole.
  fields: Schema.Array(indexField).pipe(Schema.mutable).check(Schema.isNonEmpty()),
  unique: flag,
});
export const AIIndexAdvisorRecommendationSchema = Schema.Struct({
  id: text,
  category: AIIndexAdvisorRecommendationCategorySchema,
  title: name,
  rationale: name,
  confidence: defaulted(Schema.Literals(['high', 'medium', 'low']), () => 'medium' as const),
  index: optionalDecoded(recommendedIndex),
  targetIndexName: optionalDecoded(name),
  affectedQueries: optionalDecoded(
    Schema.Array(Schema.Unknown)
      .pipe(Schema.decodeTo(validItems(name)))
      .pipe(
        Schema.decodeTo(Schema.Array(Schema.String).pipe(Schema.mutable), {
          decode: SchemaGetter.transform((queries) => queries.slice(0, 5)),
          encode: SchemaGetter.transform((queries) => queries),
        }),
      ),
  ),
});
const indexAdvisorResult = (preserveIds: boolean) =>
  Schema.Struct({
    summary: trimmedText.pipe(Schema.mutableKey),
    recommendations: validItems(AIIndexAdvisorRecommendationSchema, (recommendation, index) => ({
      ...recommendation,
      id: (preserveIds && recommendation.id) || `rec_${index + 1}`,
    })).pipe(Schema.mutableKey),
  });

export type ConversationMessage = typeof ConversationMessageSchema.Type;
export type AICommentMode = typeof AICommentModeSchema.Type;
export type AICommentFieldInput = typeof AICommentFieldInputSchema.Type;
export type AICommentRequest = typeof AICommentRequestSchema.Type;
export type AICommentFieldResult = typeof AICommentFieldResultSchema.Type;
export type AICommentResult = typeof AICommentResultSchema.Type;
export type AIIndexAdvisorFieldInput = typeof AIIndexAdvisorFieldInputSchema.Type;
export type AIIndexAdvisorIndexInput = typeof AIIndexAdvisorIndexInputSchema.Type;
export type AIIndexAdvisorRequest = typeof AIIndexAdvisorRequestSchema.Type;
export type AIIndexAdvisorRecommendationCategory =
  typeof AIIndexAdvisorRecommendationCategorySchema.Type;
export type AIIndexAdvisorRecommendation = typeof AIIndexAdvisorRecommendationSchema.Type;
export type AIIndexAdvisorResult = typeof AIIndexAdvisorResultSchema.Type;

export const AIIndexAdvisorResultSchema = indexAdvisorResult(true);
export const AIIndexAdvisorProviderResultSchema = indexAdvisorResult(false);
export const decodeAICommentResult = Schema.decodeUnknownSync(AICommentResultSchema);
export const decodeAIIndexAdvisorResult = Schema.decodeUnknownSync(AIIndexAdvisorResultSchema);
export const decodeAIIndexAdvisorProviderResult = Schema.decodeUnknownSync(
  AIIndexAdvisorProviderResultSchema,
);
