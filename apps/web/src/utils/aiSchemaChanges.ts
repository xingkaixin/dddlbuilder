import type {
  FieldRow,
  IndexDefinition,
  PersistedState,
  NormalizedField,
} from '@ddlbuilder/shared-types';
import type { GeneratedTableSchema } from '@ddlbuilder/shared-types/ai-generate';
import { diffPersistedState, getSchemaAndTable, type FieldDiff } from '@ddlbuilder/ddl-core';

export type AISchemaChangeStatus = 'pending' | 'accepted' | 'rejected';

export type AISchemaChange =
  | {
      id: string;
      kind: 'table';
      type: 'schema_name' | 'table_name' | 'table_comment';
      oldValue: string;
      newValue: string;
      status?: AISchemaChangeStatus;
    }
  | {
      id: string;
      kind: 'field';
      type: FieldDiff['type'];
      fieldName: string;
      oldField?: NormalizedField;
      newField?: NormalizedField;
      oldRow?: FieldRow;
      newRow?: FieldRow;
      oldFieldName?: string;
      newFieldName?: string;
      changes?: FieldDiff['changes'];
      status?: AISchemaChangeStatus;
    }
  | {
      id: string;
      kind: 'index';
      type: 'add' | 'remove' | 'modify';
      indexName: string;
      oldIndex?: IndexDefinition;
      newIndex?: IndexDefinition;
      status?: AISchemaChangeStatus;
    };

function buildGeneratedRows(schema: GeneratedTableSchema): FieldRow[] {
  return schema.fields.map((field, index) => ({
    order: index + 1,
    fieldName: field.fieldName,
    fieldType: field.fieldType,
    fieldComment: field.fieldComment,
    nullable: field.nullable,
    defaultKind: field.defaultKind,
    defaultValue: field.defaultValue || '',
    onUpdate: field.onUpdate || '无',
  }));
}

function sameIndex(a: IndexDefinition, b: IndexDefinition) {
  return (
    a.name === b.name &&
    !!a.unique === !!b.unique &&
    !!a.isPrimary === !!b.isPrimary &&
    a.fields.length === b.fields.length &&
    a.fields.every((field, index) => {
      const other = b.fields[index];
      return other && field.name === other.name && field.direction === other.direction;
    })
  );
}

function buildGeneratedIndexes(
  schema: GeneratedTableSchema,
  baseIndexes: IndexDefinition[],
): IndexDefinition[] {
  const now = Date.now();
  const existingIds = new Map(baseIndexes.map((index) => [index.name.toLowerCase(), index.id]));
  const pkFields = schema.fields
    .filter((field) => field.isPrimaryKey)
    .map((field) => ({ name: field.fieldName, direction: 'ASC' as const }));
  const hasSameFields = (fields: IndexDefinition['fields']) =>
    pkFields.length > 0 &&
    fields.length === pkFields.length &&
    fields.every(
      (field, index) =>
        field.name.trim().toLowerCase() === pkFields[index]?.name.trim().toLowerCase() &&
        field.direction === pkFields[index]?.direction,
    );
  const indexes = (schema.indexes || []).map((index, i) => {
    const isPrimary = /^primary$|^pk_/i.test(index.name) && hasSameFields(index.fields);
    return {
      id: existingIds.get(index.name.toLowerCase()) ?? `ai-index-${now}-${i}`,
      name: index.name,
      fields: index.fields,
      unique: isPrimary ? true : index.unique,
      isPrimary,
    };
  });

  if (pkFields.length > 0 && !indexes.some((index) => index.isPrimary)) {
    const oldPrimary = baseIndexes.find((index) => index.isPrimary);
    indexes.unshift({
      id: oldPrimary?.id ?? `ai-primary-${now}`,
      name: oldPrimary?.name || 'PRIMARY',
      fields: pkFields,
      unique: true,
      isPrimary: true,
    });
  }

  return indexes;
}

export function buildCandidateStateFromAISchema(
  baseState: PersistedState,
  schema: GeneratedTableSchema,
): PersistedState {
  const qualifiedIdentity = schema.tableName.includes('.')
    ? getSchemaAndTable(schema.tableName)
    : null;
  const identity = schema.schemaName
    ? {
        schemaName: schema.schemaName,
        tableName: qualifiedIdentity ? qualifiedIdentity.table : schema.tableName,
      }
    : qualifiedIdentity
      ? {
          schemaName: qualifiedIdentity.schema,
          tableName: qualifiedIdentity.table,
        }
      : { schemaName: baseState.schemaName, tableName: schema.tableName };

  return {
    ...baseState,
    objectType: 'table',
    schemaName: identity.schemaName,
    tableName: identity.tableName,
    tableComment: schema.tableComment || '',
    rows: buildGeneratedRows(schema),
    indexes: buildGeneratedIndexes(schema, baseState.indexes || []),
  };
}

function fieldRowByName(rows: FieldRow[], fieldName?: string) {
  if (!fieldName) return undefined;
  const name = fieldName.toLowerCase();
  return rows.find((row) => row.fieldName.trim().toLowerCase() === name);
}

function buildFieldChangeId(change: FieldDiff) {
  return [
    'field',
    change.type,
    change.oldFieldName || change.oldField?.name || '',
    change.newFieldName || change.newField?.name || change.fieldName,
  ].join(':');
}

function buildIndexChanges(
  baseIndexes: IndexDefinition[],
  nextIndexes: IndexDefinition[],
): AISchemaChange[] {
  const changes: AISchemaChange[] = [];
  const baseByName = new Map(baseIndexes.map((index) => [index.name.toLowerCase(), index]));
  const nextByName = new Map(nextIndexes.map((index) => [index.name.toLowerCase(), index]));

  for (const [name, oldIndex] of baseByName) {
    const newIndex = nextByName.get(name);
    if (!newIndex) {
      changes.push({
        id: `index:remove:${oldIndex.name}`,
        kind: 'index',
        type: 'remove',
        indexName: oldIndex.name,
        oldIndex,
      });
    } else if (!sameIndex(oldIndex, newIndex)) {
      changes.push({
        id: `index:modify:${oldIndex.name}`,
        kind: 'index',
        type: 'modify',
        indexName: oldIndex.name,
        oldIndex,
        newIndex: { ...newIndex, id: oldIndex.id },
      });
    }
  }

  for (const [name, newIndex] of nextByName) {
    if (!baseByName.has(name)) {
      changes.push({
        id: `index:add:${newIndex.name}`,
        kind: 'index',
        type: 'add',
        indexName: newIndex.name,
        newIndex,
      });
    }
  }

  return changes;
}

export function buildAISchemaChanges(
  baseState: PersistedState,
  candidateState: PersistedState,
): AISchemaChange[] {
  const diff = diffPersistedState(baseState, candidateState);
  const changes: AISchemaChange[] = [];

  if ((baseState.schemaName || '') !== (candidateState.schemaName || '')) {
    changes.push({
      id: 'table:schema_name',
      kind: 'table',
      type: 'schema_name',
      oldValue: baseState.schemaName || '',
      newValue: candidateState.schemaName || '',
    });
  }

  if (diff.tableNameChanged) {
    changes.push({
      id: 'table:table_name',
      kind: 'table',
      type: 'table_name',
      oldValue: diff.oldTableName || '',
      newValue: diff.newTableName || '',
    });
  }

  if (diff.tableCommentChanged) {
    changes.push({
      id: 'table:table_comment',
      kind: 'table',
      type: 'table_comment',
      oldValue: diff.oldTableComment || '',
      newValue: diff.newTableComment || '',
    });
  }

  for (const field of diff.fields) {
    const oldName = field.oldFieldName || field.oldField?.name || field.fieldName;
    const newName = field.newFieldName || field.newField?.name || field.fieldName;
    changes.push({
      id: buildFieldChangeId(field),
      kind: 'field',
      type: field.type,
      fieldName: field.fieldName,
      oldField: field.oldField,
      newField: field.newField,
      oldRow: fieldRowByName(baseState.rows, oldName),
      newRow: fieldRowByName(candidateState.rows, newName),
      oldFieldName: field.oldFieldName,
      newFieldName: field.newFieldName,
      changes: field.changes,
    });
  }

  changes.push(...buildIndexChanges(baseState.indexes || [], candidateState.indexes || []));

  return changes;
}
