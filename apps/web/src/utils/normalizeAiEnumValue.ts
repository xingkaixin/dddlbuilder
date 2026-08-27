import type { GeneratedField, GeneratedTableSchema } from '@ddlbuilder/shared-types/ai-generate';
import {
  createEntityId,
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

function normalizeGeneratedFields(
  fields: GeneratedField[],
  baseFields: ReadonlyArray<Pick<GeneratedField, 'id' | 'fieldName'>>,
): GeneratedField[] {
  const existingFields = baseFields.filter((field) => field.fieldName.trim());
  const baseIds = new Set(
    existingFields.map((field) => field.id).filter((id): id is string => !!id),
  );
  const idsByName = new Map(
    existingFields.map((field) => [field.fieldName.trim().toLowerCase(), field.id]),
  );
  const usedIds = new Set<string>();
  let hasUnidentifiedAddition = false;
  const normalized = fields.map((field) => {
    if (field.id != null && (typeof field.id !== 'string' || !baseIds.has(field.id))) {
      throw new Error('Unknown AI field identity');
    }
    const existingId =
      field.id === null
        ? undefined
        : (field.id ?? idsByName.get(field.fieldName.trim().toLowerCase()));
    if (!existingId && field.id === undefined) hasUnidentifiedAddition = true;
    const id = existingId || createEntityId();
    if (usedIds.has(id)) throw new Error('Duplicate AI field identity');
    usedIds.add(id);
    return { ...normalizeGeneratedField(field), id };
  });
  if (hasUnidentifiedAddition && [...baseIds].some((id) => !usedIds.has(id))) {
    throw new Error('AI field replacement requires an explicit identity');
  }
  return normalized;
}

export function normalizeGeneratedTableSchema(
  schema: GeneratedTableSchema,
  baseFields: ReadonlyArray<Pick<GeneratedField, 'id' | 'fieldName'>> = [],
): GeneratedTableSchema {
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
    fields: Array.isArray(schema.fields) ? normalizeGeneratedFields(schema.fields, baseFields) : [],
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
