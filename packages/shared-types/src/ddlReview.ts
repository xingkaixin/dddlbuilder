import * as Schema from 'effect/Schema';
import * as SchemaGetter from 'effect/SchemaGetter';
import { FIELD_DEFAULT_KINDS, FIELD_ON_UPDATES } from './fieldRow.js';
import {
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
} from './fieldRow.js';

export const DDL_REVIEW_SUGGESTION_TYPES = [
  'add_field',
  'modify_field',
  'remove_field',
  'add_index',
  'remove_index',
  'performance_warning',
  'general',
] as const;

export type DDLReviewSuggestionType = (typeof DDL_REVIEW_SUGGESTION_TYPES)[number];

const fieldChanges = {
  fieldType: Schema.optional(Schema.String),
  fieldComment: Schema.optional(Schema.String),
  nullable: Schema.optional(Schema.Boolean),
  defaultKind: Schema.optional(Schema.Literals(FIELD_DEFAULT_KINDS)),
  defaultValue: Schema.optional(Schema.String),
  onUpdate: Schema.optional(Schema.Literals(FIELD_ON_UPDATES)),
};
export const DDLReviewFieldSchema = Schema.Struct({
  ...fieldChanges,
  fieldName: Schema.String,
  fieldType: Schema.String,
});
export const DDLReviewFieldChangesSchema = Schema.Struct(fieldChanges);
const common = {
  id: Schema.String,
  description: Schema.String,
  actionable: Schema.Boolean,
  applied: Schema.optional(Schema.Boolean),
};
export const DDLReviewStructuredSuggestionSchema = Schema.Union([
  Schema.Struct({ ...common, type: Schema.Literal('add_field'), field: DDLReviewFieldSchema }),
  Schema.Struct({
    ...common,
    type: Schema.Literal('modify_field'),
    fieldModification: Schema.Struct({
      fieldName: Schema.String,
      changes: DDLReviewFieldChangesSchema,
    }),
  }),
  Schema.Struct({ ...common, type: Schema.Literal('remove_field'), fieldName: Schema.String }),
  Schema.Struct({
    ...common,
    type: Schema.Literal('add_index'),
    index: Schema.Struct({
      name: Schema.String,
      fields: Schema.Array(
        Schema.Struct({ name: Schema.String, direction: Schema.Literals(['ASC', 'DESC']) }),
      ).pipe(Schema.mutable),
      unique: Schema.optional(Schema.Boolean),
    }),
  }),
  Schema.Struct({ ...common, type: Schema.Literal('remove_index'), indexName: Schema.String }),
  Schema.Struct({
    ...common,
    type: Schema.Literal('performance_warning'),
    actionable: Schema.Literal(false),
    severity: Schema.optional(Schema.Literals(['warning', 'error'])),
  }),
  Schema.Struct({ ...common, type: Schema.Literal('general'), actionable: Schema.Literal(false) }),
]);
export const DDLReviewSuggestionSchema = Schema.Union([
  Schema.String,
  DDLReviewStructuredSuggestionSchema,
]);
export const DDLReviewResultSchema = Schema.Struct({
  score: Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 10 })),
  summary: Schema.String,
  suggestions: Schema.Array(DDLReviewSuggestionSchema).pipe(Schema.mutable),
});

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type DDLReviewField = Mutable<typeof DDLReviewFieldSchema.Type>;

export type DDLReviewFieldChanges = Mutable<typeof DDLReviewFieldChangesSchema.Type>;

export type DDLReviewStructuredSuggestion = Mutable<
  typeof DDLReviewStructuredSuggestionSchema.Type
>;

export type DDLReviewSuggestion = typeof DDLReviewSuggestionSchema.Type;

export type DDLReviewResult = Mutable<typeof DDLReviewResultSchema.Type>;

type SuggestionCommon = Pick<
  DDLReviewStructuredSuggestion,
  'id' | 'description' | 'actionable' | 'applied'
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readRequiredString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();

  return trimmed || null;
};

const parseCommon = (value: Record<string, unknown>): SuggestionCommon | null => {
  const id = readRequiredString(value.id);
  const description = readRequiredString(value.description);

  if (!id || !description) return null;

  return {
    id,
    description,
    actionable: value.actionable === true,
    ...(typeof value.applied === 'boolean' ? { applied: value.applied } : {}),
  };
};

const toGeneralSuggestion = (common: SuggestionCommon): DDLReviewStructuredSuggestion => ({
  ...common,
  type: 'general',
  actionable: false,
});

const parseField = (value: unknown): DDLReviewField | null => {
  if (!isRecord(value)) return null;
  const fieldName = readRequiredString(value.fieldName);
  const fieldType = readRequiredString(value.fieldType);

  if (!fieldName || !fieldType) return null;

  return {
    fieldName,
    fieldType,
    ...(typeof value.fieldComment === 'string' ? { fieldComment: value.fieldComment } : {}),
    ...(typeof value.defaultValue === 'string' ? { defaultValue: value.defaultValue } : {}),
    ...('nullable' in value ? { nullable: normalizeFieldNullable(value.nullable) } : {}),
    ...('defaultKind' in value
      ? { defaultKind: normalizeFieldDefaultKind(value.defaultKind) }
      : {}),
    ...('onUpdate' in value ? { onUpdate: normalizeFieldOnUpdate(value.onUpdate) } : {}),
  };
};

const parseFieldChanges = (value: unknown): DDLReviewFieldChanges | null => {
  if (!isRecord(value)) return null;

  const changes: DDLReviewFieldChanges = {
    ...(typeof value.fieldType === 'string' ? { fieldType: value.fieldType } : {}),
    ...(typeof value.fieldComment === 'string' ? { fieldComment: value.fieldComment } : {}),
    ...(typeof value.defaultValue === 'string' ? { defaultValue: value.defaultValue } : {}),
    ...('nullable' in value ? { nullable: normalizeFieldNullable(value.nullable) } : {}),
    ...('defaultKind' in value
      ? { defaultKind: normalizeFieldDefaultKind(value.defaultKind) }
      : {}),
    ...('onUpdate' in value ? { onUpdate: normalizeFieldOnUpdate(value.onUpdate) } : {}),
  };

  return Object.keys(changes).length > 0 ? changes : null;
};

const parseIndex = (
  value: unknown,
): Extract<DDLReviewStructuredSuggestion, { type: 'add_index' }>['index'] | null => {
  if (!isRecord(value)) return null;
  const name = readRequiredString(value.name);

  if (!name || !Array.isArray(value.fields)) return null;

  const fields = value.fields.flatMap((field) => {
    if (!isRecord(field)) return [];
    const fieldName = readRequiredString(field.name);

    if (!fieldName) return [];

    return [{ name: fieldName, direction: field.direction === 'DESC' ? 'DESC' : 'ASC' } as const];
  });

  if (fields.length === 0) return null;

  return {
    name,
    fields,
    ...(typeof value.unique === 'boolean' ? { unique: value.unique } : {}),
  };
};

const parseStructuredSuggestion = (
  value: Record<string, unknown>,
): DDLReviewStructuredSuggestion | null => {
  const common = parseCommon(value);

  if (!common) return null;

  switch (value.type) {
    case 'add_field': {
      const field = parseField(value.field);

      return field ? { ...common, type: 'add_field', field } : toGeneralSuggestion(common);
    }

    case 'modify_field': {
      if (!isRecord(value.fieldModification)) return toGeneralSuggestion(common);
      const fieldName = readRequiredString(value.fieldModification.fieldName);
      const changes = parseFieldChanges(value.fieldModification.changes);

      return fieldName && changes
        ? { ...common, type: 'modify_field', fieldModification: { fieldName, changes } }
        : toGeneralSuggestion(common);
    }

    case 'remove_field': {
      const fieldName = readRequiredString(value.fieldName);

      return fieldName
        ? { ...common, type: 'remove_field', fieldName }
        : toGeneralSuggestion(common);
    }

    case 'add_index': {
      const index = parseIndex(value.index);

      return index ? { ...common, type: 'add_index', index } : toGeneralSuggestion(common);
    }

    case 'remove_index': {
      const indexName = readRequiredString(value.indexName);

      return indexName
        ? { ...common, type: 'remove_index', indexName }
        : toGeneralSuggestion(common);
    }

    case 'performance_warning':
      return {
        ...common,
        type: 'performance_warning',
        actionable: false,
        ...(value.severity === 'warning' || value.severity === 'error'
          ? { severity: value.severity }
          : {}),
      };
    case 'general':
    default:
      return toGeneralSuggestion(common);
  }
};

export const normalizeDDLReviewSuggestions = (value: unknown): DDLReviewSuggestion[] => {
  if (!Array.isArray(value)) return [];
  const suggestions: DDLReviewSuggestion[] = [];

  for (const suggestion of value) {
    if (typeof suggestion === 'string') {
      const trimmed = suggestion.trim();

      if (trimmed) suggestions.push(trimmed);
      continue;
    }

    if (!isRecord(suggestion)) continue;
    const parsed = parseStructuredSuggestion(suggestion);

    if (parsed) suggestions.push(parsed);
  }

  return suggestions;
};

const normalizeResult = (payload: unknown, fallbackSummary: string): DDLReviewResult => {
  if (!isRecord(payload)) {
    return { score: 5, summary: fallbackSummary, suggestions: [] };
  }

  return {
    score: Math.min(10, Math.max(1, Number(payload.score) || 5)),
    summary: typeof payload.summary === 'string' ? payload.summary : fallbackSummary,
    suggestions: normalizeDDLReviewSuggestions(payload.suggestions),
  };
};

export const ddlReviewProviderSchema = (fallbackSummary: string) =>
  Schema.Unknown.pipe(
    Schema.decodeTo(DDLReviewResultSchema, {
      decode: SchemaGetter.transform((payload) => normalizeResult(payload, fallbackSummary)),
      encode: SchemaGetter.transform((result) => result),
    }),
  );

export const normalizeDDLReviewResult = (
  payload: unknown,
  fallbackSummary: string,
): DDLReviewResult => Schema.decodeUnknownSync(ddlReviewProviderSchema(fallbackSummary))(payload);
