import type { GeneratedField, GeneratedTableSchema } from '@ddlbuilder/shared-types/ai-generate';
import {
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
} from '@ddlbuilder/shared-types';
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
