import type { FieldRow, ForeignKeyDefinition, PersistedState } from '@ddlbuilder/shared-types';
import { createEmptyRow } from '@/utils/helpers';
import { renameIndexNameTokens } from '@/utils/fieldRenameUtils';
import {
  getSqlIdentifierKey,
  getSchemaAndTable,
  getIdentifierNameMaxLength,
  truncateIdentifierName,
  renameSqlExpressionFields,
  sqlExpressionReferencesField,
} from '@ddlbuilder/ddl-core';

function referencesCurrentTable(state: PersistedState, foreignKey: ForeignKeyDefinition): boolean {
  const current = getSchemaAndTable(state.tableName);
  const target = getSchemaAndTable(foreignKey.refTable);
  const normalize = (value: string) => getSqlIdentifierKey(value, state.dbType);
  return (
    normalize(current.table) === normalize(target.table) &&
    normalize(state.schemaName || current.schema) ===
      normalize(foreignKey.refSchema || target.schema)
  );
}

export function updateDocumentTable(
  state: PersistedState,
  changes: Partial<Pick<PersistedState, 'schemaName' | 'tableName' | 'tableComment'>>,
): PersistedState {
  const next = {
    ...state,
    schemaName: changes.schemaName ?? state.schemaName,
    tableName: changes.tableName ?? state.tableName,
    tableComment: changes.tableComment ?? state.tableComment,
  };
  if (next.schemaName === state.schemaName && next.tableName === state.tableName) return next;
  const target = getSchemaAndTable(next.tableName);
  return {
    ...next,
    foreignKeys: state.foreignKeys?.map((foreignKey) =>
      referencesCurrentTable(state, foreignKey)
        ? {
            ...foreignKey,
            refTable: target.table,
            refSchema: next.schemaName || target.schema || undefined,
          }
        : foreignKey,
    ),
  };
}

export function updateDocumentFields(state: PersistedState, rows: FieldRow[]): PersistedState {
  const key = (name: string) => getSqlIdentifierKey(name, state.dbType);
  const previousNames = new Map(state.rows.map((row) => [row.id, row.fieldName.trim()]));
  const renames = new Map<string, string>();
  const clearedNames: string[] = [];
  for (const row of rows) {
    if (!row.id) continue;
    const oldName = previousNames.get(row.id);
    const newName = row.fieldName.trim();
    if (oldName && !newName) clearedNames.push(oldName);
    if (oldName && newName && oldName !== newName) renames.set(key(oldName), newName);
  }
  const document = removeFieldReferences({ ...state, rows }, clearedNames);
  if (renames.size === 0) return document;

  const rename = (name: string) => renames.get(key(name)) ?? name;
  const renameIndexField = <T extends { name: string }>(field: T): T => {
    const name = rename(field.name);
    return name === field.name ? field : { ...field, name };
  };
  const tableMiscConfig = document.tableMiscConfig;
  const partitions = tableMiscConfig?.partitions;
  const clustering = partitions?.clustering;
  return {
    ...document,
    indexes: document.indexes.map((index) => {
      const indexRenames = new Map(
        index.fields
          .filter((field) => renames.has(key(field.name)))
          .map((field) => [key(field.name), rename(field.name)]),
      );
      if (indexRenames.size === 0) return index;
      const name = renameIndexNameTokens(index.name, indexRenames, state.dbType);
      return {
        ...index,
        name:
          name === index.name
            ? name
            : truncateIdentifierName(name, getIdentifierNameMaxLength(state.dbType)),
        fields: index.fields.map(renameIndexField),
      };
    }),
    foreignKeys: document.foreignKeys?.map((foreignKey) => ({
      ...foreignKey,
      fields: foreignKey.fields.map(rename),
      refFields: referencesCurrentTable(state, foreignKey)
        ? foreignKey.refFields.map(rename)
        : foreignKey.refFields,
    })),
    mysqlPartitionConfig: document.mysqlPartitionConfig
      ? {
          ...document.mysqlPartitionConfig,
          columns: document.mysqlPartitionConfig.columns.map(
            (column) =>
              renames.get(key(column)) ?? renameSqlExpressionFields(column, renames, state.dbType),
          ),
          expression: document.mysqlPartitionConfig.expression
            ? renameSqlExpressionFields(
                document.mysqlPartitionConfig.expression,
                renames,
                state.dbType,
              )
            : undefined,
        }
      : undefined,
    citusShardingConfig: document.citusShardingConfig
      ? {
          ...document.citusShardingConfig,
          distributionColumn: document.citusShardingConfig.distributionColumn
            ? rename(document.citusShardingConfig.distributionColumn)
            : undefined,
        }
      : undefined,
    tableMiscConfig:
      tableMiscConfig && partitions && clustering
        ? {
            ...tableMiscConfig,
            partitions: {
              ...partitions,
              clustering: { ...clustering, columns: clustering.columns.map(rename) },
            },
          }
        : tableMiscConfig,
  };
}

export function removeFieldsFromDocument(
  state: PersistedState,
  shouldRemove: (row: FieldRow, index: number) => boolean,
): PersistedState {
  const removedFieldNames = state.rows.filter(shouldRemove).map((row) => row.fieldName);
  const remainingRows = state.rows.filter((row, index) => !shouldRemove(row, index));
  const rows = remainingRows.length > 0 ? remainingRows : [createEmptyRow()];
  return removeFieldReferences({ ...state, rows }, removedFieldNames);
}

function removeFieldReferences(state: PersistedState, fieldNames: string[]): PersistedState {
  const removedFieldNames = fieldNames
    .map((name) => getSqlIdentifierKey(name, state.dbType))
    .filter(Boolean);
  const removedNames = new Set(removedFieldNames);
  if (removedNames.size === 0) return state;
  const matchesRemovedField = (name: string) =>
    removedNames.has(getSqlIdentifierKey(name, state.dbType));
  const referencesRemovedField = (expression: string) =>
    removedFieldNames.some((name) => sqlExpressionReferencesField(expression, name, state.dbType));
  const expression = state.mysqlPartitionConfig?.expression;
  const removesExpression = expression && referencesRemovedField(expression);
  const mysqlPartitionConfig = state.mysqlPartitionConfig
    ? {
        ...state.mysqlPartitionConfig,
        columns: state.mysqlPartitionConfig.columns.filter(
          (column) => !matchesRemovedField(column) && !referencesRemovedField(column),
        ),
        expression: removesExpression ? undefined : expression,
      }
    : undefined;
  if (
    mysqlPartitionConfig &&
    mysqlPartitionConfig.columns.length === 0 &&
    !mysqlPartitionConfig.expression
  ) {
    mysqlPartitionConfig.enabled = false;
  }

  const citusShardingConfig = state.citusShardingConfig
    ? matchesRemovedField(state.citusShardingConfig.distributionColumn ?? '')
      ? { mode: 'reference' as const, distributionColumn: undefined }
      : state.citusShardingConfig
    : undefined;

  const clustering = state.tableMiscConfig?.partitions?.clustering;
  const nextClustering = clustering
    ? {
        ...clustering,
        columns: clustering.columns.filter((column) => !matchesRemovedField(column)),
      }
    : undefined;
  if (nextClustering && nextClustering.columns.length === 0) nextClustering.enabled = false;
  const tableMiscConfig = state.tableMiscConfig
    ? {
        ...state.tableMiscConfig,
        partitions: state.tableMiscConfig.partitions
          ? {
              ...state.tableMiscConfig.partitions,
              clustering: nextClustering,
            }
          : undefined,
      }
    : undefined;

  return {
    ...state,
    indexes: state.indexes.filter(
      (index) => !index.fields.some((field) => matchesRemovedField(field.name)),
    ),
    foreignKeys: state.foreignKeys?.filter(
      (foreignKey) =>
        !foreignKey.fields.some(matchesRemovedField) &&
        !(
          referencesCurrentTable(state, foreignKey) &&
          foreignKey.refFields.some(matchesRemovedField)
        ),
    ),
    mysqlPartitionConfig,
    citusShardingConfig,
    tableMiscConfig,
  };
}
