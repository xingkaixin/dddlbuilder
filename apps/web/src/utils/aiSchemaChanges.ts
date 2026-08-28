import {
  createEntityId,
  type DatabaseType,
  type FieldRow,
  type IndexDefinition,
  type PersistedState,
  type NormalizedField,
  type SqlFormatMode,
} from '@ddlbuilder/shared-types';
import type { GeneratedTableSchema } from '@ddlbuilder/shared-types/ai-generate';
import {
  diffPersistedState,
  getSchemaAndTable,
  getSqlIdentifierKey,
  type FieldDiff,
} from '@ddlbuilder/ddl-core';

export type AISchemaChangeStatus = 'pending' | 'accepted' | 'rejected' | 'applied';

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

function buildGeneratedRows(
  schema: GeneratedTableSchema,
  baseRows: FieldRow[],
  dbType: DatabaseType,
): FieldRow[] {
  const rowsById = new Map(baseRows.map((row) => [row.id, row]));
  const rowsByName = new Map(
    baseRows.map((row) => [getSqlIdentifierKey(row.fieldName, dbType), row]),
  );
  return schema.fields.map((field) => {
    const original =
      field.id === null
        ? undefined
        : field.id
          ? rowsById.get(field.id)
          : rowsByName.get(getSqlIdentifierKey(field.fieldName, dbType));
    return {
      ...original,
      id: field.id ?? original?.id ?? createEntityId(),
      fieldName: field.fieldName,
      fieldType: field.fieldType,
      fieldComment: field.fieldComment,
      nullable: field.nullable,
      defaultKind: field.defaultKind,
      defaultValue: field.defaultValue || '',
      onUpdate: field.onUpdate ?? 'none',
    };
  });
}

function sameIndex(a: IndexDefinition, b: IndexDefinition) {
  return (
    a.name === b.name &&
    a.kind === b.kind &&
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
  dbType: DatabaseType,
): IndexDefinition[] {
  const key = (name: string) => getSqlIdentifierKey(name, dbType);
  const existingIndexes = new Map(baseIndexes.map((index) => [key(index.name), index]));
  const pkFields = schema.fields
    .filter((field) => field.isPrimaryKey)
    .map((field) => ({ name: field.fieldName, direction: 'ASC' as const }));
  const pkNames = new Set(pkFields.map((field) => key(field.name)));
  const hasSameFields = (fields: IndexDefinition['fields']) =>
    fields.length === pkFields.length && fields.every((field) => pkNames.has(key(field.name)));
  const oldPrimary = baseIndexes.find((index) => index.kind === 'primary');
  const primarySource =
    pkFields.length > 0
      ? schema.indexes?.find((index) =>
          oldPrimary
            ? key(index.name) === key(oldPrimary.name)
            : !existingIndexes.has(key(index.name)) && index.unique && hasSameFields(index.fields),
        )
      : undefined;
  const indexes: IndexDefinition[] = (schema.indexes || [])
    .filter((index) => index !== primarySource)
    .map((index) => {
      const existing = existingIndexes.get(key(index.name));
      return {
        id: existing?.id ?? createEntityId(),
        name: index.name,
        fields: index.fields,
        kind: index.unique
          ? existing?.kind === 'unique_constraint'
            ? 'unique_constraint'
            : 'unique_index'
          : 'index',
      };
    });

  if (pkFields.length > 0) {
    const orderedFields = primarySource?.fields ?? oldPrimary?.fields;
    indexes.unshift({
      id: oldPrimary?.id ?? createEntityId(),
      name: oldPrimary?.name || primarySource?.name || 'PRIMARY',
      fields: orderedFields && hasSameFields(orderedFields) ? orderedFields : pkFields,
      kind: 'primary',
    });
  }

  return indexes;
}

type AISchemaStateContext =
  | { baseState: PersistedState; dbType?: never; sqlFormatMode?: never }
  | {
      baseState?: never;
      dbType: DatabaseType;
      sqlFormatMode: SqlFormatMode;
    };

function createBaseState(dbType: DatabaseType, sqlFormatMode: SqlFormatMode): PersistedState {
  return {
    objectType: 'table',
    schemaName: '',
    tableName: '',
    tableComment: '',
    dbType,
    sqlFormatMode,
    rows: [],
    addCount: 10,
    indexInput: '',
    currentIndexFields: [],
    indexes: [],
    authInput: '',
    authObjects: [],
    tableMiscConfig: {
      enabled: false,
      engine: '',
      charset: '',
      collation: '',
      tablespace: '',
    },
    mysqlPartitionConfig: {
      enabled: false,
      type: 'RANGE',
      columns: [],
      partitionCount: 4,
      partitions: [],
    },
    foreignKeys: [],
  };
}

export function buildPersistedStateFromAISchema(
  schema: GeneratedTableSchema,
  context: AISchemaStateContext,
): PersistedState {
  const baseState = context.baseState ?? createBaseState(context.dbType, context.sqlFormatMode);
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
    rows: buildGeneratedRows(schema, baseState.rows, baseState.dbType),
    indexes: buildGeneratedIndexes(schema, baseState.indexes || [], baseState.dbType),
  };
}

function fieldRowByName(state: PersistedState, fieldName?: string) {
  if (!fieldName) return undefined;
  const name = getSqlIdentifierKey(fieldName, state.dbType);
  return state.rows.find((row) => getSqlIdentifierKey(row.fieldName, state.dbType) === name);
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
  dbType: DatabaseType,
): AISchemaChange[] {
  const changes: AISchemaChange[] = [];
  const baseByName = new Map(
    baseIndexes.map((index) => [getSqlIdentifierKey(index.name, dbType), index]),
  );
  const nextByName = new Map(
    nextIndexes.map((index) => [getSqlIdentifierKey(index.name, dbType), index]),
  );

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
      oldRow: fieldRowByName(baseState, oldName),
      newRow: fieldRowByName(candidateState, newName),
      oldFieldName: field.oldFieldName,
      newFieldName: field.newFieldName,
      changes: field.changes,
    });
  }

  changes.push(
    ...buildIndexChanges(baseState.indexes || [], candidateState.indexes || [], baseState.dbType),
  );

  return changes;
}
