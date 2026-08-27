import {
  createEntityId,
  type ForeignKeyAction,
  type ForeignKeyDefinition,
  type IndexDefinition,
  type PersistedState,
} from '@ddlbuilder/shared-types';
import { getForeignKeyIssue } from '@ddlbuilder/ddl-core';

export type RelationshipCardinality = 'many-to-one' | 'one-to-one';
export type RelationshipOptionality = 'required' | 'optional';

export type TableRelationshipDraft = {
  source: PersistedState;
  target: PersistedState;
};

export type TableRelationshipIntent = {
  name: string;
  sourceField: string;
  targetField: string;
  cardinality: RelationshipCardinality;
  optionality: RelationshipOptionality;
  createIndex: boolean;
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
};

export type TableRelationshipWarning = 'field-type-mismatch';
export type TableRelationshipError =
  | 'missing-name'
  | 'missing-source-field'
  | 'missing-target-field'
  | 'target-field-not-key'
  | 'duplicate-relationship'
  | 'duplicate-name'
  | 'primary-key-cannot-be-optional'
  | 'set-null-requires-optional'
  | 'unsupported-foreign-key-action';

export type TableRelationshipPlan = {
  sourceState: PersistedState;
  foreignKey: ForeignKeyDefinition;
  addedIndex?: IndexDefinition;
  changedNullability: boolean;
  warnings: TableRelationshipWarning[];
};

export type TableRelationshipPlanResult =
  | { ok: true; plan: TableRelationshipPlan }
  | { ok: false; error: TableRelationshipError };

function normalizedIdentifier(value: string): string {
  return value
    .trim()
    .replaceAll(/[^a-zA-Z0-9_]+/g, '_')
    .replaceAll(/^_+|_+$/g, '');
}

function fieldNames(index: IndexDefinition): string[] {
  return index.fields.map((field) => field.name);
}

function hasSingleFieldIndex(
  indexes: IndexDefinition[],
  fieldName: string,
  requiresUnique: boolean,
): boolean {
  return indexes.some(
    (index) =>
      fieldNames(index)[0] === fieldName &&
      (!requiresUnique ||
        (index.fields.length === 1 && (index.isPrimary === true || index.unique))),
  );
}

function isPrimaryKeyField(state: PersistedState, fieldName: string): boolean {
  return (state.indexes ?? []).some(
    (index) => index.isPrimary === true && fieldNames(index).includes(fieldName),
  );
}

function normalizedFieldType(state: PersistedState, fieldName: string): string {
  return (
    state.rows
      .find((row) => row.fieldName === fieldName)
      ?.fieldType.trim()
      .replaceAll(/\s+/g, ' ')
      .toUpperCase() ?? ''
  );
}

function buildRelationshipIndex(
  state: PersistedState,
  fieldName: string,
  isUnique: boolean,
): IndexDefinition {
  const prefix = isUnique ? 'uk' : 'idx';
  const baseName = `${prefix}_${normalizedIdentifier(state.tableName)}_${normalizedIdentifier(fieldName)}`;
  const existingNames = new Set((state.indexes ?? []).map((index) => index.name));
  let name = baseName;
  for (let suffix = 2; existingNames.has(name); suffix += 1) {
    name = `${baseName}_${suffix}`;
  }

  return {
    id: createEntityId(),
    name,
    fields: [{ name: fieldName, direction: 'ASC' }],
    unique: isUnique,
  };
}

export function referencedKeyFields(state: PersistedState): Set<string> {
  return new Set(
    (state.indexes ?? [])
      .filter((index) => index.isPrimary === true || index.unique)
      .filter((index) => index.fields.length === 1)
      .map((index) => index.fields[0]?.name)
      .filter((fieldName): fieldName is string => Boolean(fieldName)),
  );
}

export function defaultRelationshipIntent(
  draft: TableRelationshipDraft,
  sourceField: string,
  targetField: string,
): TableRelationshipIntent {
  return {
    name: `fk_${normalizedIdentifier(draft.source.tableName)}_${normalizedIdentifier(sourceField)}_to_${normalizedIdentifier(draft.target.tableName)}`,
    sourceField,
    targetField,
    cardinality: 'many-to-one',
    optionality: isPrimaryKeyField(draft.source, sourceField) ? 'required' : 'optional',
    createIndex: true,
  };
}

export function planTableRelationship(
  draft: TableRelationshipDraft,
  intent: TableRelationshipIntent,
): TableRelationshipPlanResult {
  const relationshipName = intent.name.trim();
  if (!relationshipName) return { ok: false, error: 'missing-name' };

  const sourceField = draft.source.rows.find((row) => row.fieldName === intent.sourceField);
  if (!sourceField) return { ok: false, error: 'missing-source-field' };

  const targetField = draft.target.rows.find((row) => row.fieldName === intent.targetField);
  if (!targetField) return { ok: false, error: 'missing-target-field' };

  if (!referencedKeyFields(draft.target).has(intent.targetField)) {
    return { ok: false, error: 'target-field-not-key' };
  }

  const foreignKeys = draft.source.foreignKeys ?? [];
  if (
    foreignKeys.some(
      (foreignKey) =>
        foreignKey.fields.length === 1 &&
        foreignKey.fields[0] === intent.sourceField &&
        foreignKey.refSchema === (draft.target.schemaName || undefined) &&
        foreignKey.refTable === draft.target.tableName &&
        foreignKey.refFields.length === 1 &&
        foreignKey.refFields[0] === intent.targetField,
    )
  ) {
    return { ok: false, error: 'duplicate-relationship' };
  }

  if (foreignKeys.some((foreignKey) => foreignKey.name === relationshipName)) {
    return { ok: false, error: 'duplicate-name' };
  }

  if (intent.optionality === 'optional' && isPrimaryKeyField(draft.source, intent.sourceField)) {
    return { ok: false, error: 'primary-key-cannot-be-optional' };
  }

  if (
    intent.optionality === 'required' &&
    (intent.onDelete === 'SET NULL' || intent.onUpdate === 'SET NULL')
  ) {
    return { ok: false, error: 'set-null-requires-optional' };
  }

  const foreignKey: ForeignKeyDefinition = {
    id: createEntityId(),
    name: relationshipName,
    fields: [intent.sourceField],
    refSchema: draft.target.schemaName || undefined,
    refTable: draft.target.tableName,
    refFields: [intent.targetField],
    onDelete: intent.onDelete,
    onUpdate: intent.onUpdate,
  };
  if (getForeignKeyIssue(foreignKey, draft.source.dbType)) {
    return { ok: false, error: 'unsupported-foreign-key-action' };
  }

  const requiresUniqueIndex = intent.cardinality === 'one-to-one';
  const indexes = draft.source.indexes ?? [];
  const needsIndex =
    (requiresUniqueIndex || intent.createIndex) &&
    !hasSingleFieldIndex(indexes, intent.sourceField, requiresUniqueIndex);
  const addedIndex = needsIndex
    ? buildRelationshipIndex(draft.source, intent.sourceField, requiresUniqueIndex)
    : undefined;
  const expectedNullable = intent.optionality === 'optional';
  const changedNullability = sourceField.nullable !== expectedNullable;
  const warnings: TableRelationshipWarning[] = [];

  if (
    normalizedFieldType(draft.source, intent.sourceField) !==
    normalizedFieldType(draft.target, intent.targetField)
  ) {
    warnings.push('field-type-mismatch');
  }

  return {
    ok: true,
    plan: {
      sourceState: {
        ...draft.source,
        rows: draft.source.rows.map((row) =>
          row.fieldName === intent.sourceField ? { ...row, nullable: expectedNullable } : row,
        ),
        indexes: addedIndex ? [...indexes, addedIndex] : indexes,
        foreignKeys: [...foreignKeys, foreignKey],
      },
      foreignKey,
      addedIndex,
      changedNullability,
      warnings,
    },
  };
}
