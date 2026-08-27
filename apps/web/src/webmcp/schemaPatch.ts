import {
  createEntityId,
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
  type FieldRow,
  type IndexDefinition,
  type PersistedState,
} from '@ddlbuilder/shared-types';
import { removeFieldsFromDocument } from '@/stores/editorDocumentMutations';
import { validateIndexFields } from '@/stores/editorDocumentValidation';
import { isSameIdentifierToken, replaceIdentifierToken } from '@/utils/fieldRenameUtils';

type JsonRecord = Record<string, unknown>;

export type SchemaPatchOperation =
  | {
      id: string;
      kind: 'table.update';
      schemaName?: string;
      tableName?: string;
      tableComment?: string;
    }
  | {
      id: string;
      kind: 'field.add';
      afterFieldId?: string;
      field: Omit<FieldRow, 'id'>;
    }
  | {
      id: string;
      kind: 'field.update';
      fieldId: string;
      changes: Partial<Omit<FieldRow, 'id'>>;
    }
  | { id: string; kind: 'field.remove'; fieldId: string }
  | { id: string; kind: 'field.reorder'; fieldId: string; afterFieldId?: string }
  | {
      id: string;
      kind: 'index.add';
      index: Omit<IndexDefinition, 'id'>;
    }
  | {
      id: string;
      kind: 'index.update';
      indexId: string;
      changes: Partial<Omit<IndexDefinition, 'id'>>;
    }
  | { id: string; kind: 'index.remove'; indexId: string };

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (record: JsonRecord, key: string, required = false) => {
  const value = record[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || (required && value.trim().length === 0)) {
    throw new Error(`Invalid ${key}`);
  }
  return value.trim();
};

const readBoolean = (record: JsonRecord, key: string, fallback: boolean) => {
  const value = record[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`Invalid ${key}`);
  return value;
};

const parseField = (value: unknown, partial: boolean): Partial<Omit<FieldRow, 'id'>> => {
  if (!isRecord(value)) throw new Error('Invalid field');
  const fieldName = readString(value, 'fieldName', !partial);
  const fieldType = readString(value, 'fieldType', !partial);
  const fieldComment = readString(value, 'fieldComment');
  const defaultValue = readString(value, 'defaultValue');
  const nullable =
    value.nullable === undefined ? undefined : normalizeFieldNullable(value.nullable);
  const defaultKind =
    value.defaultKind === undefined ? undefined : normalizeFieldDefaultKind(value.defaultKind);
  const onUpdate =
    value.onUpdate === undefined ? undefined : normalizeFieldOnUpdate(value.onUpdate);

  return {
    ...(fieldName === undefined ? {} : { fieldName }),
    ...(fieldType === undefined ? {} : { fieldType }),
    ...(fieldComment === undefined ? {} : { fieldComment }),
    ...(nullable === undefined ? {} : { nullable }),
    ...(defaultKind === undefined ? {} : { defaultKind }),
    ...(defaultValue === undefined ? {} : { defaultValue }),
    ...(onUpdate === undefined ? {} : { onUpdate }),
  };
};

const parseIndexFields = (value: unknown) => {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Invalid index fields');
  return value.map((item) => {
    if (!isRecord(item)) throw new Error('Invalid index field');
    const name = readString(item, 'name', true) as string;
    const direction = item.direction ?? 'ASC';
    if (direction !== 'ASC' && direction !== 'DESC') throw new Error('Invalid index direction');
    return { name, direction: direction as 'ASC' | 'DESC' };
  });
};

const parseIndex = (value: unknown, partial: boolean): Partial<Omit<IndexDefinition, 'id'>> => {
  if (!isRecord(value)) throw new Error('Invalid index');
  const name = readString(value, 'name', !partial);
  const fields = value.fields === undefined ? undefined : parseIndexFields(value.fields);
  if (!partial && !fields) throw new Error('Invalid index fields');
  return {
    ...(name === undefined ? {} : { name }),
    ...(fields === undefined ? {} : { fields }),
    ...(value.unique === undefined ? {} : { unique: readBoolean(value, 'unique', false) }),
    ...(value.isPrimary === undefined ? {} : { isPrimary: readBoolean(value, 'isPrimary', false) }),
  };
};

export function parseSchemaPatchOperations(value: unknown): SchemaPatchOperation[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Operations are required');

  const ids = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Invalid operation at index ${index}`);
    const kind = readString(item, 'kind', true);
    const id = readString(item, 'id') ?? `operation-${index + 1}`;
    if (ids.has(id)) throw new Error(`Duplicate operation id: ${id}`);
    ids.add(id);

    switch (kind) {
      case 'table.update':
        return {
          id,
          kind,
          ...(readString(item, 'schemaName') === undefined
            ? {}
            : { schemaName: readString(item, 'schemaName') }),
          ...(readString(item, 'tableName') === undefined
            ? {}
            : { tableName: readString(item, 'tableName') }),
          ...(readString(item, 'tableComment') === undefined
            ? {}
            : { tableComment: readString(item, 'tableComment') }),
        };
      case 'field.add':
        return {
          id,
          kind,
          ...(readString(item, 'afterFieldId')
            ? { afterFieldId: readString(item, 'afterFieldId') }
            : {}),
          field: {
            fieldName: '',
            fieldType: '',
            fieldComment: '',
            nullable: true,
            defaultKind: 'none',
            defaultValue: '',
            onUpdate: 'none',
            ...parseField(item.field, false),
          },
        };
      case 'field.update':
        return {
          id,
          kind,
          fieldId: readString(item, 'fieldId', true) as string,
          changes: parseField(item.changes, true),
        };
      case 'field.remove':
        return { id, kind, fieldId: readString(item, 'fieldId', true) as string };
      case 'field.reorder':
        return {
          id,
          kind,
          fieldId: readString(item, 'fieldId', true) as string,
          ...(readString(item, 'afterFieldId')
            ? { afterFieldId: readString(item, 'afterFieldId') }
            : {}),
        };
      case 'index.add':
        return {
          id,
          kind,
          index: {
            name: '',
            fields: [],
            unique: false,
            ...parseIndex(item.index, false),
          },
        };
      case 'index.update':
        return {
          id,
          kind,
          indexId: readString(item, 'indexId', true) as string,
          changes: parseIndex(item.changes, true),
        };
      case 'index.remove':
        return { id, kind, indexId: readString(item, 'indexId', true) as string };
      default:
        throw new Error(`Unsupported operation kind: ${kind}`);
    }
  });
}

const renameFieldReferences = (state: PersistedState, oldName: string, newName: string) => {
  const rename = (name: string) => (isSameIdentifierToken(name, oldName) ? newName : name);
  const mysqlPartitionConfig = state.mysqlPartitionConfig
    ? {
        ...state.mysqlPartitionConfig,
        columns: state.mysqlPartitionConfig.columns.map(rename),
        expression: state.mysqlPartitionConfig.expression
          ? replaceIdentifierToken(state.mysqlPartitionConfig.expression, oldName, newName)
          : undefined,
      }
    : undefined;
  const citusShardingConfig = state.citusShardingConfig
    ? {
        ...state.citusShardingConfig,
        distributionColumn: state.citusShardingConfig.distributionColumn
          ? rename(state.citusShardingConfig.distributionColumn)
          : undefined,
      }
    : undefined;
  const clustering = state.tableMiscConfig?.partitions?.clustering;
  const tableMiscConfig = state.tableMiscConfig
    ? {
        ...state.tableMiscConfig,
        partitions: state.tableMiscConfig.partitions
          ? {
              ...state.tableMiscConfig.partitions,
              clustering: clustering
                ? { ...clustering, columns: clustering.columns.map(rename) }
                : undefined,
            }
          : undefined,
      }
    : undefined;

  return {
    ...state,
    currentIndexFields: state.currentIndexFields.map((field) => ({
      ...field,
      name: rename(field.name),
    })),
    indexes: state.indexes.map((index) => ({
      ...index,
      fields: index.fields.map((field) => ({ ...field, name: rename(field.name) })),
    })),
    foreignKeys: state.foreignKeys?.map((foreignKey) => ({
      ...foreignKey,
      fields: foreignKey.fields.map(rename),
    })),
    mysqlPartitionConfig,
    citusShardingConfig,
    tableMiscConfig,
  };
};

const assertUniqueFieldName = (rows: FieldRow[], name: string, exceptId?: string) => {
  if (
    rows.some(
      (row) =>
        row.id !== exceptId && row.fieldName.trim().toLowerCase() === name.trim().toLowerCase(),
    )
  ) {
    throw new Error(`Duplicate field name: ${name}`);
  }
};

const assertUniqueIndexName = (indexes: IndexDefinition[], name: string, exceptId?: string) => {
  if (
    indexes.some(
      (index) => index.id !== exceptId && index.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new Error(`Duplicate index name: ${name}`);
  }
};

export function applySchemaPatchOperations(
  baseState: PersistedState,
  operations: SchemaPatchOperation[],
): PersistedState {
  let state = structuredClone(baseState);

  for (const operation of operations) {
    switch (operation.kind) {
      case 'table.update':
        state = {
          ...state,
          ...(operation.schemaName === undefined ? {} : { schemaName: operation.schemaName }),
          ...(operation.tableName === undefined ? {} : { tableName: operation.tableName }),
          ...(operation.tableComment === undefined ? {} : { tableComment: operation.tableComment }),
        };
        break;
      case 'field.add': {
        assertUniqueFieldName(state.rows, operation.field.fieldName);
        const row = { ...operation.field, id: createEntityId() };
        const firstEmptyIndex = state.rows.findIndex((item) => !item.fieldName.trim());
        const afterIndex = operation.afterFieldId
          ? state.rows.findIndex((item) => item.id === operation.afterFieldId)
          : -1;
        if (operation.afterFieldId && afterIndex < 0) {
          throw new Error(`Field not found: ${operation.afterFieldId}`);
        }
        const insertIndex =
          afterIndex >= 0
            ? afterIndex + 1
            : firstEmptyIndex >= 0
              ? firstEmptyIndex
              : state.rows.length;
        const rows = [...state.rows];
        rows.splice(insertIndex, 0, row);
        state = { ...state, rows };
        break;
      }
      case 'field.update': {
        const rowIndex = state.rows.findIndex((row) => row.id === operation.fieldId);
        if (rowIndex < 0) throw new Error(`Field not found: ${operation.fieldId}`);
        const oldRow = state.rows[rowIndex];
        const newName = operation.changes.fieldName;
        if (newName) assertUniqueFieldName(state.rows, newName, operation.fieldId);
        const rows = [...state.rows];
        rows[rowIndex] = { ...oldRow, ...operation.changes, id: oldRow.id };
        state = { ...state, rows };
        if (newName && !isSameIdentifierToken(oldRow.fieldName, newName)) {
          state = renameFieldReferences(state, oldRow.fieldName, newName);
        }
        break;
      }
      case 'field.remove': {
        const row = state.rows.find((item) => item.id === operation.fieldId);
        if (!row) throw new Error(`Field not found: ${operation.fieldId}`);
        state = removeFieldsFromDocument(state, (item) => item.id === operation.fieldId);
        break;
      }
      case 'field.reorder': {
        const fromIndex = state.rows.findIndex((row) => row.id === operation.fieldId);
        if (fromIndex < 0) throw new Error(`Field not found: ${operation.fieldId}`);
        const rows = [...state.rows];
        const [row] = rows.splice(fromIndex, 1);
        const afterIndex = operation.afterFieldId
          ? rows.findIndex((item) => item.id === operation.afterFieldId)
          : -1;
        if (operation.afterFieldId && afterIndex < 0) {
          throw new Error(`Field not found: ${operation.afterFieldId}`);
        }
        rows.splice(afterIndex + 1, 0, row);
        state = { ...state, rows };
        break;
      }
      case 'index.add': {
        assertUniqueIndexName(state.indexes, operation.index.name);
        state = {
          ...state,
          indexes: [...state.indexes, { ...operation.index, id: createEntityId() }],
        };
        break;
      }
      case 'index.update': {
        const target = state.indexes.find((index) => index.id === operation.indexId);
        if (!target) throw new Error(`Index not found: ${operation.indexId}`);
        if (operation.changes.name) {
          assertUniqueIndexName(state.indexes, operation.changes.name, operation.indexId);
        }
        state = {
          ...state,
          indexes: state.indexes.map((index) =>
            index.id === operation.indexId
              ? { ...index, ...operation.changes, id: index.id }
              : index,
          ),
        };
        break;
      }
      case 'index.remove': {
        if (!state.indexes.some((index) => index.id === operation.indexId)) {
          throw new Error(`Index not found: ${operation.indexId}`);
        }
        state = {
          ...state,
          indexes: state.indexes.filter((index) => index.id !== operation.indexId),
        };
        break;
      }
    }
  }

  validateIndexFields(state);
  return state;
}
