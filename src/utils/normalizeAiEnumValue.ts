import type { GeneratedField, GeneratedTableSchema } from '@/types/aiGenerate';
import type { StructuredSuggestion } from '@/hooks/useDDLReview';

function toNormalizedToken(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim().toLowerCase().replace(/\s+/g, '_');
  }
  if (value == null) {
    return '';
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value).trim().toLowerCase().replace(/\s+/g, '_');
  }
  try {
    return (JSON.stringify(value) ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  } catch {
    return '';
  }
}

export function normalizeAiNullable(value: unknown): '是' | '否' {
  const token = toNormalizedToken(value);

  if (['否', 'no', 'n', 'false', '0', 'not_null', 'notnull'].includes(token)) {
    return '否';
  }

  return '是';
}

export function normalizeAiDefaultKind(
  value: unknown,
): '无' | '自增' | '常量' | '当前时间' | 'uuid' {
  const token = toNormalizedToken(value);

  if (['自增', 'auto_increment', 'autoincrement', 'identity'].includes(token)) {
    return '自增';
  }

  if (['常量', 'constant', 'const', 'literal'].includes(token)) {
    return '常量';
  }

  if (
    ['当前时间', 'current_timestamp', 'current_time', 'now()', 'currenttimestamp'].includes(token)
  ) {
    return '当前时间';
  }

  if (['uuid'].includes(token)) {
    return 'uuid';
  }

  return '无';
}

export function normalizeAiOnUpdate(value: unknown): '无' | '当前时间' {
  const token = toNormalizedToken(value);

  if (
    ['当前时间', 'current_timestamp', 'current_time', 'now()', 'currenttimestamp'].includes(token)
  ) {
    return '当前时间';
  }

  return '无';
}

function normalizeGeneratedField(field: GeneratedField): GeneratedField {
  return {
    ...field,
    nullable: normalizeAiNullable(field.nullable),
    defaultKind: normalizeAiDefaultKind(field.defaultKind),
    onUpdate: normalizeAiOnUpdate(field.onUpdate),
  };
}

export function normalizeGeneratedTableSchema(schema: GeneratedTableSchema): GeneratedTableSchema {
  return {
    ...schema,
    fields: Array.isArray(schema.fields) ? schema.fields.map(normalizeGeneratedField) : [],
  };
}

function normalizeStructuredSuggestion(suggestion: StructuredSuggestion): StructuredSuggestion {
  const next = { ...suggestion };

  if (next.field) {
    next.field = {
      ...next.field,
      nullable: normalizeAiNullable(next.field.nullable),
      defaultKind: normalizeAiDefaultKind(next.field.defaultKind),
      onUpdate: normalizeAiOnUpdate(next.field.onUpdate),
    };
  }

  if (next.fieldModification?.changes) {
    next.fieldModification = {
      ...next.fieldModification,
      changes: {
        ...next.fieldModification.changes,
        nullable: normalizeAiNullable(next.fieldModification.changes.nullable),
        defaultKind: normalizeAiDefaultKind(next.fieldModification.changes.defaultKind),
        onUpdate: normalizeAiOnUpdate(next.fieldModification.changes.onUpdate),
      },
    };
  }

  return next;
}

export function normalizeReviewSuggestions(suggestions: unknown[]) {
  return suggestions.map((item) => {
    if (!item || typeof item !== 'object') {
      return item;
    }

    const candidate = item as StructuredSuggestion;
    if (!candidate.type) {
      return item;
    }

    return normalizeStructuredSuggestion(candidate);
  });
}
