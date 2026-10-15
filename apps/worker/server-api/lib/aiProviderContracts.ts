import * as Schema from 'effect/Schema';
import { DDL_REVIEW_SUGGESTION_TYPES } from '@ddlbuilder/shared-types/ddl-review';
import { FIELD_DEFAULT_KINDS, FIELD_ON_UPDATES } from '@ddlbuilder/shared-types';

const changes = {
  fieldType: Schema.optionalKey(Schema.String),
  fieldComment: Schema.optionalKey(Schema.String),
  nullable: Schema.optionalKey(Schema.Boolean),
  defaultKind: Schema.optionalKey(Schema.Literals(FIELD_DEFAULT_KINDS)),
  defaultValue: Schema.optionalKey(Schema.String),
  onUpdate: Schema.optionalKey(Schema.Literals(FIELD_ON_UPDATES)),
};

// Anthropic limits union parameters; business validation still uses the discriminated review contract.
export const AIReviewProviderSchema = Schema.Struct({
  score: Schema.Number,
  summary: Schema.String,
  suggestions: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      type: Schema.Literals(DDL_REVIEW_SUGGESTION_TYPES),
      description: Schema.String,
      actionable: Schema.Boolean,
      field: Schema.optionalKey(
        Schema.Struct({ ...changes, fieldName: Schema.String, fieldType: Schema.String }),
      ),
      fieldModification: Schema.optionalKey(
        Schema.Struct({ fieldName: Schema.String, changes: Schema.Struct(changes) }),
      ),
      fieldName: Schema.optionalKey(Schema.String),
      index: Schema.optionalKey(
        Schema.Struct({
          name: Schema.String,
          fields: Schema.Array(
            Schema.Struct({ name: Schema.String, direction: Schema.Literals(['ASC', 'DESC']) }),
          ),
          unique: Schema.optionalKey(Schema.Boolean),
        }),
      ),
      indexName: Schema.optionalKey(Schema.String),
    }),
  ),
});

export const AICommentProviderSchema = Schema.Struct({
  tableComment: Schema.String,
  fields: Schema.Array(Schema.Struct({ fieldName: Schema.String, fieldComment: Schema.String })),
});

export const AIIndexProviderSchema = Schema.Struct({
  summary: Schema.String,
  recommendations: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      category: Schema.Literals([
        'missing_index',
        'redundant_index',
        'order_optimization',
        'query_rewrite',
        'general',
      ]),
      title: Schema.String,
      rationale: Schema.String,
      confidence: Schema.Literals(['high', 'medium', 'low']),
      index: Schema.optionalKey(
        Schema.Struct({
          name: Schema.String,
          fields: Schema.Array(
            Schema.Struct({ name: Schema.String, direction: Schema.Literals(['ASC', 'DESC']) }),
          ),
          unique: Schema.Boolean,
        }),
      ),
      targetIndexName: Schema.optionalKey(Schema.String),
      affectedQueries: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
  ),
});
