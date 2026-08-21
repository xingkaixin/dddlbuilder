import type { FieldDefaultKind, FieldOnUpdate } from './fieldRow.js';
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

export type DDLReviewField = {
  fieldName: string;
  fieldType: string;
  fieldComment?: string;
  nullable?: boolean;
  defaultKind?: FieldDefaultKind;
  defaultValue?: string;
  onUpdate?: FieldOnUpdate;
};

export type DDLReviewFieldChanges = Partial<Omit<DDLReviewField, 'fieldName'>>;

type DDLReviewSuggestionBase<TType extends DDLReviewSuggestionType> = {
  id: string;
  description: string;
  type: TType;
  actionable: boolean;
  applied?: boolean;
};

export type DDLReviewStructuredSuggestion =
  | (DDLReviewSuggestionBase<'add_field'> & { field: DDLReviewField })
  | (DDLReviewSuggestionBase<'modify_field'> & {
      fieldModification: { fieldName: string; changes: DDLReviewFieldChanges };
    })
  | (DDLReviewSuggestionBase<'remove_field'> & { fieldName: string })
  | (DDLReviewSuggestionBase<'add_index'> & {
      index: {
        name: string;
        fields: { name: string; direction: 'ASC' | 'DESC' }[];
        unique?: boolean;
      };
    })
  | (DDLReviewSuggestionBase<'remove_index'> & { indexName: string })
  | (DDLReviewSuggestionBase<'performance_warning'> & {
      actionable: false;
      severity?: 'warning' | 'error';
    })
  | (DDLReviewSuggestionBase<'general'> & { actionable: false });

export type DDLReviewSuggestion = string | DDLReviewStructuredSuggestion;

export type DDLReviewResult = {
  score: number;
  summary: string;
  suggestions: DDLReviewSuggestion[];
};

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

export const normalizeDDLReviewResult = (
  payload: unknown,
  fallbackSummary: string,
): DDLReviewResult => {
  if (!isRecord(payload)) {
    return { score: 5, summary: fallbackSummary, suggestions: [] };
  }
  return {
    score: Math.min(10, Math.max(1, Number(payload.score) || 5)),
    summary: typeof payload.summary === 'string' ? payload.summary : fallbackSummary,
    suggestions: normalizeDDLReviewSuggestions(payload.suggestions),
  };
};
