import * as Schema from 'effect/Schema';
import * as SchemaGetter from 'effect/SchemaGetter';
import {
  FIELD_DEFAULT_KINDS,
  FIELD_ON_UPDATES,
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
} from './fieldRow.js';

export const GeneratedFieldSchema = Schema.Struct({
  /** Existing fields keep their ID across renames; null explicitly denotes a new field. */
  id: Schema.optional(Schema.NullOr(Schema.String)),
  fieldName: Schema.String,
  fieldType: Schema.String,
  fieldComment: Schema.String,
  nullable: Schema.Boolean,
  defaultKind: Schema.Literals(FIELD_DEFAULT_KINDS),
  defaultValue: Schema.optional(Schema.String),
  onUpdate: Schema.optional(Schema.Literals(FIELD_ON_UPDATES)),
  isPrimaryKey: Schema.optional(Schema.Boolean),
});

export const GeneratedIndexSchema = Schema.Struct({
  name: Schema.String,
  fields: Schema.Array(
    Schema.Struct({ name: Schema.String, direction: Schema.Literals(['ASC', 'DESC']) }),
  ).pipe(Schema.mutable),
  unique: Schema.Boolean,
});

export const GeneratedDesignDecisionSchema = Schema.Struct({
  title: Schema.String,
  rationale: Schema.String,
});
export const GeneratedTableSchema = Schema.Struct({
  schemaName: Schema.optional(Schema.String),
  tableName: Schema.String,
  tableComment: Schema.String,
  fields: Schema.Array(GeneratedFieldSchema).pipe(Schema.mutable),
  indexes: Schema.optional(Schema.Array(GeneratedIndexSchema).pipe(Schema.mutable)),
  designDecisions: Schema.optional(
    Schema.Array(GeneratedDesignDecisionSchema).pipe(Schema.mutable),
  ),
});

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
export type GeneratedField = Mutable<typeof GeneratedFieldSchema.Type>;
export type GeneratedIndex = Mutable<typeof GeneratedIndexSchema.Type>;
export type GeneratedDesignDecision = Mutable<typeof GeneratedDesignDecisionSchema.Type>;
export type GeneratedTableSchema = Mutable<typeof GeneratedTableSchema.Type>;
export type PartialTableSchema = Partial<GeneratedTableSchema>;

const providerField = Schema.Struct({
  ...GeneratedFieldSchema.fields,
  nullable: Schema.optional(Schema.Unknown),
  defaultKind: Schema.optional(Schema.Unknown),
  onUpdate: Schema.optional(Schema.Unknown),
}).pipe(
  Schema.decodeTo(GeneratedFieldSchema, {
    decode: SchemaGetter.transform((field) => ({
      ...field,
      nullable: normalizeFieldNullable(field.nullable),
      defaultKind: normalizeFieldDefaultKind(field.defaultKind),
      onUpdate: normalizeFieldOnUpdate(field.onUpdate),
    })),
    encode: SchemaGetter.transform((field) => field),
  }),
);

export const GeneratedTableProviderSchema = Schema.Struct({
  ...GeneratedTableSchema.fields,
  fields: Schema.Array(providerField).pipe(Schema.mutable),
  designDecisions: Schema.optional(Schema.Unknown),
}).pipe(
  Schema.decodeTo(GeneratedTableSchema, {
    decode: SchemaGetter.transform((table) => ({
      ...table,
      designDecisions: Array.isArray(table.designDecisions)
        ? table.designDecisions.filter(isGeneratedDesignDecision)
        : undefined,
    })),
    encode: SchemaGetter.transform((table) => table),
  }),
);

export const isGeneratedField = Schema.is(GeneratedFieldSchema);
export const isGeneratedIndex = Schema.is(GeneratedIndexSchema);
export const isGeneratedDesignDecision = Schema.is(GeneratedDesignDecisionSchema);
export const decodeGeneratedTable = Schema.decodeUnknownSync(
  Schema.fromJsonString(GeneratedTableProviderSchema),
);

export * from './aiContracts.js';
