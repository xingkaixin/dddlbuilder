import type { GeneratedField, GeneratedTableSchema } from '@ddlbuilder/shared-types/ai-generate';
import {
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
} from '@ddlbuilder/shared-types';
import type { StructuredSuggestion } from '@/hooks/useDDLReview';
import { getSchemaAndTable } from '@ddlbuilder/ddl-core';

function normalizeGeneratedField(field: GeneratedField): GeneratedField {
  return {
    ...field,
    nullable: normalizeFieldNullable(field.nullable),
    defaultKind: normalizeFieldDefaultKind(field.defaultKind),
    onUpdate: normalizeFieldOnUpdate(field.onUpdate),
  };
}

export function normalizeGeneratedTableSchema(schema: GeneratedTableSchema): GeneratedTableSchema {
  const normalizedName =
    schema.schemaName || !schema.tableName?.includes('.')
      ? {
          schema: schema.schemaName?.trim() || '',
          table: schema.tableName,
        }
      : getSchemaAndTable(schema.tableName);

  return {
    ...schema,
    schemaName: normalizedName.schema || undefined,
    tableName: normalizedName.table,
    fields: Array.isArray(schema.fields) ? schema.fields.map(normalizeGeneratedField) : [],
    designDecisions: Array.isArray(schema.designDecisions)
      ? schema.designDecisions.filter(
          (decision) =>
            decision &&
            typeof decision.title === 'string' &&
            typeof decision.rationale === 'string',
        )
      : undefined,
  };
}

function normalizeStructuredSuggestion(suggestion: StructuredSuggestion): StructuredSuggestion {
  const next = { ...suggestion };

  if (next.field) {
    next.field = {
      ...next.field,
      nullable: normalizeFieldNullable(next.field.nullable),
      defaultKind: normalizeFieldDefaultKind(next.field.defaultKind),
      onUpdate: normalizeFieldOnUpdate(next.field.onUpdate),
    };
  }

  if (next.fieldModification?.changes) {
    next.fieldModification = {
      ...next.fieldModification,
      changes: {
        ...next.fieldModification.changes,
        nullable: normalizeFieldNullable(next.fieldModification.changes.nullable),
        defaultKind: normalizeFieldDefaultKind(next.fieldModification.changes.defaultKind),
        onUpdate: normalizeFieldOnUpdate(next.fieldModification.changes.onUpdate),
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
