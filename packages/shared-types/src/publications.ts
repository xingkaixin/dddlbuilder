import * as Schema from 'effect/Schema';

const text = (max: number) => Schema.String.check(Schema.isMaxLength(max));
const title = text(120).check(Schema.makeFilter((value) => Boolean(value.trim())));
const tables = Schema.Array(Schema.Unknown).check(Schema.isMaxLength(200));
export const StandardSummarySchema = Schema.Struct({
  id: text(200),
  name: text(200),
  description: text(4000),
  unit: text(200),
});

export type StandardSummary = typeof StandardSummarySchema.Type;

export const SchemaSnapshotSchema = Schema.Struct({
  format: Schema.Literal('ddlbuilder-schema'),
  version: Schema.Literal(1),
  tables,
  standards: Schema.Array(StandardSummarySchema).check(Schema.isMaxLength(1000)),
});
export const DocumentContentSchema = Schema.Struct({
  kind: Schema.Literal('document'),
  tables: tables.check(Schema.isMinLength(1)),
  standards: Schema.Array(StandardSummarySchema).check(Schema.isMaxLength(1000)),
});
export const ProposalContentSchema = Schema.Struct({
  kind: Schema.Literal('proposal'),
  reason: text(4000),
  before: tables,
  after: tables,
  renames: Schema.Array(
    Schema.Struct({ tableKey: text(400), from: text(200), to: text(200) }),
  ).check(Schema.isMaxLength(1000)),
});
export const PublicationContentSchema = Schema.Union([
  DocumentContentSchema,
  ProposalContentSchema,
]);
export const PublicationWriteSchema = Schema.Struct({
  title,
  visibility: Schema.Literals(['private', 'link']),
  content: PublicationContentSchema,
  revision: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
});

export type PublicationWrite = typeof PublicationWriteSchema.Type;

export const PublicationSummarySchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  kind: Schema.Literals(['document', 'proposal']),
  visibility: Schema.Literals(['private', 'link']),
  revision: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export type PublicationSummary = typeof PublicationSummarySchema.Type;

export const PublicationSchema = Schema.Struct({
  ...PublicationSummarySchema.fields,
  content: PublicationContentSchema,
  isOwner: Schema.Boolean,
});

export type Publication = typeof PublicationSchema.Type;

export const PublicationListSchema = Schema.Array(PublicationSummarySchema);
export const PublicationCommentSchema = Schema.Struct({
  id: Schema.String,
  author: Schema.String,
  target: Schema.String,
  body: Schema.String,
  resolved: Schema.Boolean,
  createdAt: Schema.String,
});

export type PublicationComment = typeof PublicationCommentSchema.Type;

export const PublicationCommentsSchema = Schema.Array(PublicationCommentSchema);
export const CommentWriteSchema = Schema.Struct({
  target: text(200),
  body: text(4000).check(Schema.makeFilter((value) => Boolean(value.trim()))),
});

export type CommentWrite = typeof CommentWriteSchema.Type;

export const decodeSchemaSnapshotEnvelope = Schema.decodeUnknownSync(SchemaSnapshotSchema);
